output "database_endpoint" { value = aws_db_instance.postgres.address }
output "database_admin_secret_arn" {
  value     = aws_db_instance.postgres.master_user_secret[0].secret_arn
  sensitive = true
}
output "backend_runtime_secret_arn" { value = aws_secretsmanager_secret.backend.arn }
output "attachments_bucket" { value = aws_s3_bucket.attachments.id }
output "cognito_client_id" { value = aws_cognito_user_pool_client.web.id }
output "cognito_issuer" { value = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.users.id}" }
output "cognito_domain" { value = "https://${aws_cognito_user_pool_domain.users.domain}.auth.${var.aws_region}.amazoncognito.com" }
output "image_repositories" { value = { for name, repository in aws_ecr_repository.application : name => repository.repository_url } }
output "ecs_execution_role_arn" { value = aws_iam_role.ecs_execution.arn }
output "backend_runtime_role_arn" { value = aws_iam_role.backend_runtime.arn }
output "application_load_balancer_dns" { value = aws_lb.application.dns_name }
output "application_url" { value = "https://${var.app_domain}" }
output "cloudfront_distribution_domain" { value = aws_cloudfront_distribution.application.domain_name }
output "private_backend_hostname" { value = "backend.${aws_service_discovery_private_dns_namespace.application.name}" }
output "network_vpc_id" { value = local.network_vpc_id }
output "network_private_subnet_ids" { value = local.network_private_ids }
output "network_public_subnet_ids" { value = local.network_public_ids }
output "network_ecs_security_group_id" { value = local.network_ecs_sg_id }
output "github_deploy_role_arn" { value = var.github_repository == null ? null : aws_iam_role.github_deploy[0].arn }
output "alerts_topic_arn" { value = var.alert_email == null ? null : aws_sns_topic.alerts[0].arn }
