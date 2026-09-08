variable "backend_image" {
  type        = string
  description = "Immutable ECR image URI for the backend container."
}
variable "frontend_image" {
  type        = string
  description = "Immutable ECR image URI for the frontend container."
}
variable "ecs_security_group_id" {
  type        = string
  description = "Security group assigned to ECS tasks."
}

resource "aws_cloudwatch_log_group" "ecs" {
  name              = "/ecs/${local.name}/services"
  retention_in_days = 30
}
resource "aws_ecs_task_definition" "backend" {
  family                   = "${local.name}-backend"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.backend_runtime.arn
  container_definitions = jsonencode([{
    name         = "backend"
    image        = var.backend_image
    essential    = true
    portMappings = [{ containerPort = 4000, protocol = "tcp" }]
    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "AUTH_MODE", value = "jwt" },
      { name = "AWS_REGION", value = var.aws_region },
      { name = "S3_BUCKET", value = aws_s3_bucket.attachments.id }
    ]
    secrets          = [{ name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.backend.arn }]
    logConfiguration = { logDriver = "awslogs", options = { awslogs-group = aws_cloudwatch_log_group.ecs.name, awslogs-region = var.aws_region, awslogs-stream-prefix = "backend" } }
    healthCheck      = { command = ["CMD-SHELL", "wget -q -O - http://localhost:4000/health || exit 1"], interval = 30, timeout = 5, retries = 3, startPeriod = 30 }
  }])
}
resource "aws_ecs_service" "backend" {
  name            = "${local.name}-backend"
  cluster         = aws_ecs_cluster.application.id
  task_definition = aws_ecs_task_definition.backend.arn
  desired_count   = var.environment == "production" ? 2 : 1
  launch_type     = "FARGATE"
  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [var.ecs_security_group_id]
    assign_public_ip = false
  }
  service_registries {
    registry_arn = aws_service_discovery_service.backend.arn
  }
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
}
resource "aws_ecs_task_definition" "frontend" {
  family                   = "${local.name}-frontend"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  container_definitions = jsonencode([{
    name             = "frontend", image = var.frontend_image, essential = true,
    portMappings     = [{ containerPort = 3000, protocol = "tcp" }]
    environment      = [{ name = "NODE_ENV", value = "production" }, { name = "API_INTERNAL_URL", value = "http://backend.${aws_service_discovery_private_dns_namespace.application.name}:4000" }, { name = "APP_URL", value = var.app_url }]
    logConfiguration = { logDriver = "awslogs", options = { awslogs-group = aws_cloudwatch_log_group.ecs.name, awslogs-region = var.aws_region, awslogs-stream-prefix = "frontend" } }
  }])
}
resource "aws_ecs_service" "frontend" {
  name            = "${local.name}-frontend"
  cluster         = aws_ecs_cluster.application.id
  task_definition = aws_ecs_task_definition.frontend.arn
  desired_count   = var.environment == "production" ? 2 : 1
  launch_type     = "FARGATE"
  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [var.ecs_security_group_id]
    assign_public_ip = false
  }
  load_balancer {
    target_group_arn = aws_lb_target_group.frontend.arn
    container_name   = "frontend"
    container_port   = 3000
  }
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
}
