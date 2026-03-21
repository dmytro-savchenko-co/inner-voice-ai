variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "innervoice"
}

variable "environment" {
  description = "Environment (dev, prod)"
  type        = string
}

variable "log_group_names" {
  description = "List of service names to create CloudWatch log groups for"
  type        = list(string)
}

variable "retention_days" {
  description = "Number of days to retain CloudWatch logs"
  type        = number
  default     = 30
}

variable "cpu_alarm_threshold" {
  description = "CPU utilization threshold (%) for CloudWatch alarm"
  type        = number
  default     = 80
}

variable "cpu_alarm_ecs_services" {
  description = "Map of ECS services to create CPU alarms for. Key is a label, value has cluster_name and service_name."
  type = map(object({
    cluster_name = string
    service_name = string
  }))
  default = {}
}

variable "tags" {
  description = "Additional tags"
  type        = map(string)
  default     = {}
}
