project_name = "innervoice"
environment  = "dev"
aws_region   = "us-east-1"

# Database
db_instance_class  = "db.t4g.micro"
db_allocated_storage = 20
db_multi_az        = false
db_deletion_protection = false  # Allow deletion in dev

# Network — use default VPC for dev simplicity
# In prod, set use_default_vpc = false and provide custom VPC config
use_default_vpc = true
