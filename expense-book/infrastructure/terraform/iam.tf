data "aws_iam_policy_document" "ecs_tasks_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}
resource "aws_iam_role" "ecs_execution" {
  name               = "${local.name}-ecs-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}
resource "aws_iam_role_policy_attachment" "ecs_execution" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}
data "aws_iam_policy_document" "ecs_execution_secret" {
  statement {
    sid       = "ReadBackendRuntimeSecret"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.backend.arn]
  }
}
resource "aws_iam_role_policy" "ecs_execution_secret" {
  name   = "${local.name}-ecs-execution-secret"
  role   = aws_iam_role.ecs_execution.id
  policy = data.aws_iam_policy_document.ecs_execution_secret.json
}
resource "aws_iam_role" "backend_runtime" {
  name               = "${local.name}-backend-runtime"
  assume_role_policy = data.aws_iam_policy_document.ecs_tasks_assume.json
}
data "aws_iam_policy_document" "backend_runtime" {
  statement {
    sid       = "PrivateAttachments"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:AbortMultipartUpload"]
    resources = ["${aws_s3_bucket.attachments.arn}/groups/*"]
  }
  statement {
    sid       = "AttachmentBucketMetadata"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.attachments.arn]
    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["groups/*"]
    }
  }
  statement {
    sid       = "RuntimeSecret"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [aws_secretsmanager_secret.backend.arn]
  }
}
resource "aws_iam_role_policy" "backend_runtime" {
  name   = "${local.name}-backend-runtime"
  role   = aws_iam_role.backend_runtime.id
  policy = data.aws_iam_policy_document.backend_runtime.json
}
