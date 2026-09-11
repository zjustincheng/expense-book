resource "aws_cloudwatch_log_group" "attachment_cleanup" {
  name              = "/ecs/${local.name}/attachment-cleanup"
  retention_in_days = 30
}

resource "aws_ecs_task_definition" "attachment_cleanup" {
  family                   = "${local.name}-attachment-cleanup"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.backend_runtime.arn
  container_definitions = jsonencode([{
    name      = "attachment-cleanup"
    image     = var.backend_image
    essential = true
    command   = ["node", "dist/cleanup-attachments.js"]
    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "AWS_REGION", value = var.aws_region },
      { name = "S3_BUCKET", value = aws_s3_bucket.attachments.id },
    ]
    secrets = [
      { name = "DATABASE_URL", valueFrom = aws_secretsmanager_secret.backend.arn },
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.attachment_cleanup.name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "cleanup"
      }
    }
  }])
}

data "aws_iam_policy_document" "scheduler_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "attachment_cleanup_scheduler" {
  name               = "${local.name}-attachment-cleanup-scheduler"
  assume_role_policy = data.aws_iam_policy_document.scheduler_assume.json
}

data "aws_iam_policy_document" "attachment_cleanup_scheduler" {
  statement {
    actions   = ["ecs:RunTask"]
    resources = [aws_ecs_task_definition.attachment_cleanup.arn]
  }
  statement {
    actions   = ["iam:PassRole"]
    resources = [aws_iam_role.ecs_execution.arn, aws_iam_role.backend_runtime.arn]
  }
}

resource "aws_iam_role_policy" "attachment_cleanup_scheduler" {
  name   = "${local.name}-attachment-cleanup-scheduler"
  role   = aws_iam_role.attachment_cleanup_scheduler.id
  policy = data.aws_iam_policy_document.attachment_cleanup_scheduler.json
}

resource "aws_scheduler_schedule" "attachment_cleanup" {
  name                         = "${local.name}-attachment-cleanup"
  description                  = "Remove expired pending attachment reservations."
  schedule_expression          = "rate(1 day)"
  schedule_expression_timezone = "UTC"
  flexible_time_window {
    mode = "OFF"
  }
  target {
    arn      = aws_ecs_cluster.application.arn
    role_arn = aws_iam_role.attachment_cleanup_scheduler.arn
    ecs_parameters {
      task_definition_arn = aws_ecs_task_definition.attachment_cleanup.arn
      launch_type         = "FARGATE"
      network_configuration {
        subnets          = local.network_private_ids
        security_groups  = [local.network_ecs_sg_id]
        assign_public_ip = false
      }
    }
  }
}

resource "aws_cloudwatch_log_metric_filter" "attachment_cleanup_failures" {
  name           = "${local.name}-attachment-cleanup-failures"
  log_group_name = aws_cloudwatch_log_group.attachment_cleanup.name
  pattern        = "{ $.failed = 1 }"
  metric_transformation {
    name      = "AttachmentCleanupFailures"
    namespace = "ExpenseBook/Maintenance"
    value     = "1"
  }
}

resource "aws_cloudwatch_metric_alarm" "attachment_cleanup_failures" {
  alarm_name          = "${local.name}-attachment-cleanup-failures"
  alarm_description   = "Pending attachment cleanup reported an S3 or database failure."
  namespace           = "ExpenseBook/Maintenance"
  metric_name         = "AttachmentCleanupFailures"
  statistic           = "Sum"
  period              = 86400
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
}
