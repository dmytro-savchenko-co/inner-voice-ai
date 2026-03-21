variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "innervoice"
}

variable "environment" {
  description = "Environment (dev, prod)"
  type        = string
}

variable "tags" {
  description = "Additional tags"
  type        = map(string)
  default     = {}
}
