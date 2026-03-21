terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "opentofu"
    }
  }
}

# ─── Variables ───────────────────────────────────────────────────────────────

variable "project_name" {
  type    = string
  default = "innervoice"
}

variable "environment" {
  type    = string
  default = "dev"
}

variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "db_instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "db_allocated_storage" {
  type    = number
  default = 20
}

variable "db_multi_az" {
  type    = bool
  default = false
}

variable "db_deletion_protection" {
  type    = bool
  default = false
}

variable "use_default_vpc" {
  type    = bool
  default = true
}

# ─── Default VPC data sources (dev simplicity) ──────────────────────────────

data "aws_vpc" "default" {
  count   = var.use_default_vpc ? 1 : 0
  default = true
}

data "aws_subnets" "default" {
  count = var.use_default_vpc ? 1 : 0

  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default[0].id]
  }

  filter {
    name   = "default-for-az"
    values = ["true"]
  }
}

locals {
  vpc_id     = var.use_default_vpc ? data.aws_vpc.default[0].id : ""
  subnet_ids = var.use_default_vpc ? data.aws_subnets.default[0].ids : []
}

# ─── Phase 0: Database ──────────────────────────────────────────────────────

module "database" {
  source = "../../modules/database"

  project_name        = var.project_name
  environment         = var.environment
  vpc_id              = local.vpc_id
  subnet_ids          = local.subnet_ids
  instance_class      = var.db_instance_class
  allocated_storage   = var.db_allocated_storage
  multi_az            = var.db_multi_az
  deletion_protection   = var.db_deletion_protection
  publicly_accessible   = true  # Dev only — disable in prod

  # Allow connections from current EC2 instance and local dev
  # In Phase 1, this will be replaced with ECS security group
  allowed_cidr_blocks = [
    "0.0.0.0/0" # Dev only — restrict in prod
  ]
}

# ─── Phase 0: Application Secrets ───────────────────────────────────────────

module "secrets" {
  source = "../../modules/secrets"

  project_name = var.project_name
  environment  = var.environment

  secrets = {
    "ec2-api-key" = {
      description   = "Shared API key between Railway web app and backend services"
      default_value = "CHANGE_ME"
    }
    "telegram-bot-token" = {
      description   = "Telegram Bot API token from BotFather"
      default_value = "CHANGE_ME"
    }
    "replicate-api-token" = {
      description   = "Replicate API token for face aging models"
      default_value = "CHANGE_ME"
    }
    "jwt-secret" = {
      description   = "JWT signing secret for web app authentication"
      default_value = "CHANGE_ME"
    }
  }
}

# ─── Outputs ─────────────────────────────────────────────────────────────────

output "database_endpoint" {
  description = "RDS endpoint for connection"
  value       = module.database.db_instance_endpoint
}

output "database_url" {
  description = "Full PostgreSQL connection URL"
  value       = module.database.database_url
  sensitive   = true
}

output "database_secret_arn" {
  description = "ARN of the database URL secret in Secrets Manager"
  value       = module.database.db_secret_arn
}

output "secret_arns" {
  description = "ARNs of application secrets"
  value       = module.secrets.secret_arns
}
