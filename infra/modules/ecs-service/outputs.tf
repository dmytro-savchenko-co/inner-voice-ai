output "service_id" {
  description = "ECS service ID"
  value       = aws_ecs_service.service.id
}

output "service_name" {
  description = "ECS service name"
  value       = aws_ecs_service.service.name
}

output "task_definition_arn" {
  description = "ARN of the ECS task definition"
  value       = aws_ecs_task_definition.service.arn
}

output "target_group_arn" {
  description = "ARN of the ALB target group (null if no ALB)"
  value       = local.has_alb ? aws_lb_target_group.service[0].arn : null
}
