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
  description = "VPC ID where RDS will be deployed"
  type        = string
  default     = ""
}

variable "subnet_ids" {
  description = "Subnet IDs for the DB subnet group. If empty, uses default VPC subnets."
  type        = list(string)
  default     = []
}

variable "allowed_security_group_ids" {
  description = "Security group IDs allowed to connect to the database"
  type        = list(string)
  default     = []
}

variable "allowed_cidr_blocks" {
  description = "CIDR blocks allowed to connect to the database"
  type        = list(string)
  default     = []
}

variable "instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t4g.micro"
}

variable "allocated_storage" {
  description = "Storage in GB"
  type        = number
  default     = 20
}

variable "db_name" {
  description = "Name of the default database"
  type        = string
  default     = "innervoice"
}

variable "db_username" {
  description = "Master username"
  type        = string
  default     = "innervoice"
}

variable "publicly_accessible" {
  description = "Make RDS publicly accessible (dev only!)"
  type        = bool
  default     = false
}

variable "multi_az" {
  description = "Enable Multi-AZ deployment"
  type        = bool
  default     = false
}

variable "backup_retention_period" {
  description = "Days to retain backups"
  type        = number
  default     = 7
}

variable "deletion_protection" {
  description = "Enable deletion protection"
  type        = bool
  default     = true
}

variable "tags" {
  description = "Additional tags"
  type        = map(string)
  default     = {}
}
