variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "innervoice"
}

variable "environment" {
  description = "Environment (dev, prod)"
  type        = string
}

variable "service_name" {
  description = "Name of the ECS service (e.g., platform-api, scheduler)"
  type        = string
}

variable "cluster_id" {
  description = "ECS cluster ID to deploy the service into"
  type        = string
}

variable "task_execution_role_arn" {
  description = "ARN of the ECS task execution IAM role"
  type        = string
}

variable "task_role_arn" {
  description = "ARN of the ECS task IAM role"
  type        = string
}

variable "container_image" {
  description = "Container image URI (ECR URL + tag)"
  type        = string
}

variable "container_port" {
  description = "Container port to expose. Set to null for services without ALB."
  type        = number
  default     = null
}

variable "cpu" {
  description = "CPU units for the task (256, 512, 1024, 2048, 4096)"
  type        = number
  default     = 256
}

variable "memory" {
  description = "Memory in MiB for the task"
  type        = number
  default     = 512
}

variable "desired_count" {
  description = "Number of desired task instances"
  type        = number
  default     = 1
}

variable "vpc_id" {
  description = "VPC ID for the ALB target group"
  type        = string
  default     = ""
}

variable "subnet_ids" {
  description = "Subnet IDs for the ECS tasks"
  type        = list(string)
}

variable "security_group_ids" {
  description = "Security group IDs for the ECS tasks"
  type        = list(string)
}

variable "environment_variables" {
  description = "Environment variables for the container"
  type        = map(string)
  default     = {}
}

variable "secrets" {
  description = "Secrets from Secrets Manager (map of name to full ARN)"
  type        = map(string)
  default     = {}
}

variable "log_group_name" {
  description = "CloudWatch log group name for container logs"
  type        = string
}

variable "alb_listener_arn" {
  description = "ALB listener ARN for registering target group rules. Set to null to skip ALB."
  type        = string
  default     = null
}

variable "health_check_path" {
  description = "Health check path for the ALB target group"
  type        = string
  default     = "/api/health"
}

variable "path_patterns" {
  description = "URL path patterns for ALB listener rule routing (e.g., [\"/api/*\"])"
  type        = list(string)
  default     = ["/api/*"]
}

variable "tags" {
  description = "Additional tags"
  type        = map(string)
  default     = {}
}
