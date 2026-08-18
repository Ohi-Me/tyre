# TYRE v3 — Terraform: AWS EKS + RDS + MSK + supporting infra.
# Idempotent. State is stored in S3 + DynamoDB lock (see backend.tf).

terraform {
  required_version = ">= 1.7"
  required_providers {
    aws = {source = "hashicorp/aws", version = "~> 5.60"}
    kubernetes = {source = "hashicorp/kubernetes", version = "~> 2.30"}
    helm = {source = "hashicorp/helm", version = "~> 2.13"}
  }
}

variable region {default = "ap-south-1"}
variable environment {default = "prod"}
variable domain {default = "tyre.example.com"}

provider "aws" {region = var.region}

# ─────────────────────────────────────────────────────────────────
# VPC
# ─────────────────────────────────────────────────────────────────
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"
  name    = "tyre-${var.environment}"
  cidr    = "10.0.0.0/16"
  azs             = ["${var.region}a", "${var.region}b", "${var.region}c"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]
  enable_nat_gateway   = true
  single_nat_gateway   = false
  enable_dns_hostnames = true
}

# ─────────────────────────────────────────────────────────────────
# EKS cluster
# ─────────────────────────────────────────────────────────────────
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.0"
  cluster_name    = "tyre-${var.environment}"
  cluster_version = "1.30"
  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets
  enable_irsa = true
  eks_managed_node_groups = {
    web = {instance_types = ["t3.large"], min_size = 3, max_size = 30, desired_size = 3}
    ai  = {instance_types = ["m5.xlarge"], min_size = 2, max_size = 20, desired_size = 2}
    gpu = {instance_types = ["g5.xlarge"], min_size = 0, max_size = 4, desired_size = 0}
  }
}

# ─────────────────────────────────────────────────────────────────
# RDS Postgres (multi-AZ)
# ─────────────────────────────────────────────────────────────────
resource "aws_db_subnet_group" "tyre" {
  name       = "tyre-${var.environment}"
  subnet_ids = module.vpc.private_subnets
}

resource "random_password" "db_password" {length = 32, special = true}

resource "aws_db_instance" "tyre_pg" {
  identifier           = "tyre-${var.environment}"
  engine               = "postgres"
  engine_version       = "16.2"
  instance_class       = "db.r6g.large"
  allocated_storage    = 200
  storage_encrypted    = true
  multi_az             = true
  db_subnet_group_name = aws_db_subnet_group.tyre.name
  username             = "tyre"
  password             = random_password.db_password.result
  backup_retention_period = 30
  deletion_protection  = true
  skip_final_snapshot  = false
  final_snapshot_identifier = "tyre-${var.environment}-final"
}

# ─────────────────────────────────────────────────────────────────
# MSK Kafka
# ─────────────────────────────────────────────────────────────────
resource "aws_msk_cluster" "tyre_kafka" {
  cluster_name           = "tyre-${var.environment}"
  kafka_version          = "3.7.0"
  number_of_broker_nodes = 3
  broker_node_group_info {
    instance_type   = "kafka.m5.large"
    client_subnets  = module.vpc.private_subnets
    security_groups = [aws_security_group.kafka.id]
    storage_info {ebs_volume_size = 200}
  }
}

# ─────────────────────────────────────────────────────────────────
# ElastiCache Redis
# ─────────────────────────────────────────────────────────────────
resource "aws_elasticache_replication_group" "tyre_redis" {
  replication_group_id = "tyre-${var.environment}"
  description          = "TYRE Redis"
  engine               = "redis"
  engine_version       = "7.1"
  node_type            = "cache.r6g.large"
  num_cache_clusters   = 3
  multi_az_enabled     = true
  subnet_group_name    = aws_elasticache_subnet_group.tyre.name
  security_group_ids   = [aws_security_group.redis.id]
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
}

resource "aws_elasticache_subnet_group" "tyre" {
  name       = "tyre-${var.environment}"
  subnet_ids = module.vpc.private_subnets
}

# ─────────────────────────────────────────────────────────────────
# Route53 + ACM cert
# ─────────────────────────────────────────────────────────────────
data "aws_route53_zone" "tyre" {name = var.domain, private_zone = false}

resource "aws_acm_certificate" "tyre" {
  domain_name       = var.domain
  validation_method = "DNS"
}

resource "aws_route53_record" "tyre_cert" {
  for_each = {for dvo in aws_acm_certificate.tyre.domain_validation_options : dvo.domain_name => dvo}
  zone_id = data.aws_route53_zone.tyre.zone_id
  name    = each.value.resource_record_name
  type    = each.value.resource_record_type
  records = [each.value.resource_record_value]
  ttl     = 60
}

# ─────────────────────────────────────────────────────────────────
# S3 buckets (backups, POD uploads, agent logs archive)
# ─────────────────────────────────────────────────────────────────
resource "aws_s3_bucket" "backups" {bucket = "tyre-${var.environment}-backups"}
resource "aws_s3_bucket" "pod" {bucket = "tyre-${var.environment}-pod-uploads"}
resource "aws_s3_bucket" "logs" {bucket = "tyre-${var.environment}-logs"}

# ─────────────────────────────────────────────────────────────────
# Secrets Manager
# ─────────────────────────────────────────────────────────────────
resource "aws_secretsmanager_secret" "tyre" {name = "tyre/${var.environment}"}
resource "aws_secretsmanager_secret_version" "tyre" {
  secret_id = aws_secretsmanager_secret.tyre.id
  secret_string = jsonencode({
    GROQ_API_KEY              = var.groq_api_key
    RAZORPAY_KEY_ID           = var.razorpay_key_id
    RAZORPAY_KEY_SECRET       = var.razorpay_key_secret
    WHATSAPP_BUSINESS_TOKEN   = var.whatsapp_business_token
    WHISPER_API_KEY           = var.whisper_api_key
    ELEVENLABS_API_KEY        = var.elevenlabs_api_key
    GOOGLE_MAPS_API_KEY       = var.google_maps_api_key
    GST_VERIFICATION_API_KEY  = var.gst_verification_api_key
  })
}
