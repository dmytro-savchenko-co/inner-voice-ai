variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "innervoice"
}

variable "environment" {
  description = "Environment (dev, prod)"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID to launch the instance in"
  type        = string
}

variable "subnet_id" {
  description = "Public subnet ID for the instance"
  type        = string
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.medium"
}

variable "key_name" {
  description = "SSH key pair name"
  type        = string
  default     = "openclaw-key"
}

variable "ebs_volume_size" {
  description = "Root EBS volume size in GB"
  type        = number
  default     = 30
}

variable "ecs_security_group_id" {
  description = "ECS security group ID (for allowing traffic from ECS to OpenClaw)"
  type        = string
}

variable "secret_arns" {
  description = "Map of secret name to ARN for Secrets Manager access"
  type        = map(string)
  default     = {}
}

variable "tags" {
  description = "Additional tags"
  type        = map(string)
  default     = {}
}
