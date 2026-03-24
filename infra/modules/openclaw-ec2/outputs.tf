output "instance_id" {
  description = "EC2 instance ID"
  value       = aws_instance.openclaw.id
}

output "public_ip" {
  description = "Public IP address of the OpenClaw instance"
  value       = aws_instance.openclaw.public_ip
}

output "private_ip" {
  description = "Private IP address of the OpenClaw instance"
  value       = aws_instance.openclaw.private_ip
}

output "security_group_id" {
  description = "Security group ID for the OpenClaw instance"
  value       = aws_security_group.openclaw.id
}
