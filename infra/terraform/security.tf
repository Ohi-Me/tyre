resource "aws_security_group" "kafka" {
  name        = "tyre-kafka-${var.environment}"
  description = "TYRE Kafka security group"
  vpc_id      = module.vpc.vpc_id
  ingress {
    from_port   = 9092
    to_port     = 9094
    protocol    = "tcp"
    cidr_blocks = [module.vpc.vpc_cidr_block]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "redis" {
  name        = "tyre-redis-${var.environment}"
  description = "TYRE Redis security group"
  vpc_id      = module.vpc.vpc_id
  ingress {
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    cidr_blocks = [module.vpc.vpc_cidr_block]
  }
}
