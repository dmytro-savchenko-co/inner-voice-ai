output "secret_arns" {
  description = "Map of secret name suffix to ARN"
  value       = { for k, v in aws_secretsmanager_secret.this : k => v.arn }
}

output "secret_ids" {
  description = "Map of secret name suffix to ID"
  value       = { for k, v in aws_secretsmanager_secret.this : k => v.id }
}
