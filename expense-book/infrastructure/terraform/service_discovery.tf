resource "aws_service_discovery_private_dns_namespace" "application" {
  name        = "${local.name}.internal"
  description = "Private service discovery for ${local.name} ECS services"
  vpc         = local.network_vpc_id
}

resource "aws_service_discovery_service" "backend" {
  name = "backend"

  dns_config {
    namespace_id   = aws_service_discovery_private_dns_namespace.application.id
    routing_policy = "MULTIVALUE"

    dns_records {
      ttl  = 10
      type = "A"
    }
  }

  health_check_custom_config {
    failure_threshold = 1
  }
}

resource "aws_vpc_security_group_ingress_rule" "backend_from_ecs" {
  security_group_id            = local.network_ecs_sg_id
  referenced_security_group_id = local.network_ecs_sg_id
  ip_protocol                  = "tcp"
  from_port                    = 4000
  to_port                      = 4000
}
