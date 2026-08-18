output vpc_id {value = module.vpc.vpc_id}
output eks_cluster_endpoint {value = module.eks.cluster_endpoint}
output rds_endpoint {value = aws_db_instance.tyre_pg.endpoint}
output redis_endpoint {value = aws_elasticache_replication_group.tyre_redis.primary_endpoint_address}
output kafka_brokers {value = aws_msk_cluster.tyre_kafka.bootstrap_brokers_tls}
