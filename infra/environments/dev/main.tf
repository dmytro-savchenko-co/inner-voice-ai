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

# ─── Phase 1: Networking ────────────────────────────────────────────────────

module "networking" {
  source = "../../modules/networking"

  project_name = var.project_name
  environment  = var.environment
}

# ─── Default VPC data (for RDS — keeping DB in default VPC for dev) ──────────

data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
  filter {
    name   = "default-for-az"
    values = ["true"]
  }
}

# ─── Phase 0: Database (stays in default VPC for dev simplicity) ─────────────

module "database" {
  source = "../../modules/database"

  project_name        = var.project_name
  environment         = var.environment
  vpc_id              = data.aws_vpc.default.id
  subnet_ids          = data.aws_subnets.default.ids
  instance_class      = var.db_instance_class
  allocated_storage   = var.db_allocated_storage
  multi_az            = var.db_multi_az
  deletion_protection = var.db_deletion_protection
  publicly_accessible = true # Dev only — disable in prod

  # Allow connections from ECS tasks (cross-VPC via public IP) and dev
  allowed_cidr_blocks = ["0.0.0.0/0"] # Dev only — restrict in prod
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

# ─── Phase 1: ECR Repositories ──────────────────────────────────────────────

module "ecr" {
  source = "../../modules/ecr"

  project_name     = var.project_name
  environment      = var.environment
  repository_names = ["platform", "scheduler"]
}

# ─── Phase 1: Storage (S3 for media) ────────────────────────────────────────

module "storage" {
  source = "../../modules/storage"

  project_name = var.project_name
  environment  = var.environment
}

# ─── Phase 1: Monitoring (CloudWatch) ───────────────────────────────────────

module "monitoring" {
  source = "../../modules/monitoring"

  project_name   = var.project_name
  environment    = var.environment
  log_group_names = ["platform", "scheduler"]
  retention_days = 30
}

# ─── Phase 1: ECS Cluster + ALB ─────────────────────────────────────────────

module "ecs_cluster" {
  source = "../../modules/ecs-cluster"

  project_name          = var.project_name
  environment           = var.environment
  vpc_id                = module.networking.vpc_id
  public_subnet_ids     = module.networking.public_subnet_ids
  alb_security_group_id = module.networking.alb_security_group_id
}

# ─── Phase 1: Platform API Service ──────────────────────────────────────────

module "platform_service" {
  source = "../../modules/ecs-service"

  project_name           = var.project_name
  environment            = var.environment
  service_name           = "platform"
  cluster_id             = module.ecs_cluster.cluster_id
  task_execution_role_arn = module.ecs_cluster.task_execution_role_arn
  task_role_arn          = module.ecs_cluster.task_role_arn
  container_image        = "${module.ecr.repository_urls["platform"]}:latest"
  container_port         = 3002
  cpu                    = 512
  memory                 = 1024
  desired_count          = 1
  vpc_id                 = module.networking.vpc_id
  subnet_ids             = module.networking.public_subnet_ids
  security_group_ids     = [module.networking.ecs_security_group_id]
  log_group_name         = module.monitoring.log_group_names["platform"]
  alb_listener_arn       = module.ecs_cluster.alb_listener_arn
  health_check_path      = "/api/health"
  path_patterns          = ["/api/*", "/photos/*"]

  environment_variables = {
    PORT                = "3002"
    DATABASE_URL        = module.database.database_url
    WEBSITE_URL         = "https://elegant-stillness-production.up.railway.app"
    BETTERNESS_MCP_URL  = "https://api.betterness.ai/mcp"
  }

  secrets = {
    EC2_API_KEY         = module.secrets.secret_arns["ec2-api-key"]
    TELEGRAM_BOT_TOKEN  = module.secrets.secret_arns["telegram-bot-token"]
    REPLICATE_API_TOKEN = module.secrets.secret_arns["replicate-api-token"]
  }
}

# ─── Phase 1: Scheduler Service ─────────────────────────────────────────────

module "scheduler_service" {
  source = "../../modules/ecs-service"

  project_name           = var.project_name
  environment            = var.environment
  service_name           = "scheduler"
  cluster_id             = module.ecs_cluster.cluster_id
  task_execution_role_arn = module.ecs_cluster.task_execution_role_arn
  task_role_arn          = module.ecs_cluster.task_role_arn
  container_image        = "${module.ecr.repository_urls["scheduler"]}:latest"
  container_port         = null # No ALB routing for scheduler
  cpu                    = 256
  memory                 = 512
  desired_count          = 1
  vpc_id                 = module.networking.vpc_id
  subnet_ids             = module.networking.public_subnet_ids
  security_group_ids     = [module.networking.ecs_security_group_id]
  log_group_name         = module.monitoring.log_group_names["scheduler"]

  environment_variables = {
    DATABASE_URL = module.database.database_url
  }

  secrets = {}
}

# ─── Outputs ─────────────────────────────────────────────────────────────────

output "database_endpoint" {
  description = "RDS endpoint"
  value       = module.database.db_instance_endpoint
}

output "database_url" {
  description = "Full PostgreSQL connection URL"
  value       = module.database.database_url
  sensitive   = true
}

output "database_secret_arn" {
  description = "ARN of the database URL secret"
  value       = module.database.db_secret_arn
}

output "secret_arns" {
  description = "ARNs of application secrets"
  value       = module.secrets.secret_arns
}

output "alb_dns_name" {
  description = "ALB DNS name (use as EC2_API_URL replacement)"
  value       = module.ecs_cluster.alb_dns_name
}

output "ecr_repository_urls" {
  description = "ECR repository URLs for Docker push"
  value       = module.ecr.repository_urls
}

output "vpc_id" {
  description = "VPC ID"
  value       = module.networking.vpc_id
}
