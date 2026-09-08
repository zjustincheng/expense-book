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
