terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

locals {
  name_prefix = "${var.project_name}-${var.environment}"
  common_tags = merge(var.tags, {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "opentofu"
  })
}

# -----------------------------------------------------------------------------
# CloudWatch Log Groups
# -----------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "main" {
  for_each = toset(var.log_group_names)

  name              = "/ecs/${local.name_prefix}/${each.value}"
  retention_in_days = var.retention_days

  tags = merge(local.common_tags, {
    Name    = "${local.name_prefix}-${each.value}-logs"
    Service = each.value
  })
}

# -----------------------------------------------------------------------------
# CloudWatch Alarm: High CPU on ECS (optional)
# -----------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "ecs_high_cpu" {
  for_each = var.cpu_alarm_ecs_services

  alarm_name          = "${local.name_prefix}-${each.key}-high-cpu"
  alarm_description   = "High CPU utilization for ${each.key} ECS service"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = 60
  statistic           = "Average"
  threshold           = var.cpu_alarm_threshold

  dimensions = {
    ClusterName = each.value.cluster_name
    ServiceName = each.value.service_name
  }

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}-${each.key}-high-cpu"
  })
}
