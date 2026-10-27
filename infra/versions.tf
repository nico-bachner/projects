terraform {
  required_version = "~> 1.13"

  required_providers {
    github = {
      source  = "integrations/github"
      version = "~> 6.13"
    }
  }

  backend "s3" {
    bucket = "tofu-state"
    key    = "terraform.tfstate"
    region = "auto"
    endpoints = {
      s3 = "https://bc01cb67e58d38ab891c5391edb5834e.r2.cloudflarestorage.com"
    }
    use_lockfile                = true
    use_path_style              = true
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_s3_checksum            = true
  }

  encryption {
    key_provider "pbkdf2" "current" {
      passphrase = var.state_passphrase
    }
    method "aes_gcm" "current" {
      keys = key_provider.pbkdf2.current
    }
    state {
      method   = method.aes_gcm.current
      enforced = true
    }
    plan {
      method   = method.aes_gcm.current
      enforced = true
    }
  }
}

provider "github" {
  owner = "nico-bachner"
}
