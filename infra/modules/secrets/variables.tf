variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "innervoice"
}

variable "environment" {
  description = "Environment (dev, prod)"
  type        = string
}

variable "secrets" {
  description = "Map of secret name suffix to description. Values are set manually after creation."
  type = map(object({
    description   = string
    default_value = optional(string, "CHANGE_ME")
  }))
  default = {}
}

variable "tags" {
  description = "Additional tags"
  type        = map(string)
  default     = {}
}
