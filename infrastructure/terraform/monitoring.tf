resource "aws_sns_topic" "alerts" {
  count = var.alert_email == null ? 0 : 1
  name  = "${local.name}-alerts"
}
resource "aws_sns_topic_subscription" "email" {
  count     = var.alert_email == null ? 0 : 1
  topic_arn = aws_sns_topic.alerts[0].arn
  protocol  = "email"
  endpoint  = var.alert_email
}
resource "aws_cloudwatch_metric_alarm" "backend_cpu" {
  alarm_name          = "${local.name}-backend-high-cpu"
  alarm_description   = "Backend ECS service CPU is elevated."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = 60
  statistic           = "Average"
  threshold           = 80
  treat_missing_data  = "notBreaching"
  dimensions = {
    ClusterName = aws_ecs_cluster.application.name
    ServiceName = aws_ecs_service.backend.name
  }
  alarm_actions = var.alert_email == null ? [] : [aws_sns_topic.alerts[0].arn]
}
resource "aws_cloudwatch_metric_alarm" "frontend_unhealthy" {
  alarm_name          = "${local.name}-frontend-unhealthy"
  alarm_description   = "The load balancer has no healthy frontend targets."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "UnHealthyHostCount"
  namespace           = "AWS/ApplicationELB"
  period              = 60
  statistic           = "Maximum"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  dimensions = {
    LoadBalancer = aws_lb.application.arn_suffix
    TargetGroup  = aws_lb_target_group.frontend.arn_suffix
  }
  alarm_actions = var.alert_email == null ? [] : [aws_sns_topic.alerts[0].arn]
}
resource "aws_cloudwatch_metric_alarm" "database_cpu" {
  alarm_name          = "${local.name}-database-high-cpu"
  alarm_description   = "RDS CPU is elevated."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  treat_missing_data  = "notBreaching"
  dimensions          = { DBInstanceIdentifier = aws_db_instance.postgres.id }
  alarm_actions       = var.alert_email == null ? [] : [aws_sns_topic.alerts[0].arn]
}
