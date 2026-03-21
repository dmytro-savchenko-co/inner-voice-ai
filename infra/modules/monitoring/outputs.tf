output "log_group_arns" {
  description = "Map of service name to CloudWatch log group ARN"
  value = {
    for name, lg in aws_cloudwatch_log_group.main : name => lg.arn
  }
}

output "log_group_names" {
  description = "Map of service name to CloudWatch log group name"
  value = {
    for name, lg in aws_cloudwatch_log_group.main : name => lg.name
  }
}
