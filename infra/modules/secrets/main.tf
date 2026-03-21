terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

locals {
  name_prefix = "${var.project_name}-${var.environment}"
  common_tags = merge(var.tags, {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "opentofu"
  })
}

resource "aws_secretsmanager_secret" "this" {
  for_each = var.secrets

  name                    = "${local.name_prefix}/${each.key}"
  description             = each.value.description
  recovery_window_in_days = var.environment == "dev" ? 0 : 30

  tags = merge(local.common_tags, {
    Name = "${local.name_prefix}/${each.key}"
  })
}

# Set initial placeholder values — update manually via AWS CLI or console
resource "aws_secretsmanager_secret_version" "this" {
  for_each = var.secrets

  secret_id     = aws_secretsmanager_secret.this[each.key].id
  secret_string = each.value.default_value
}
