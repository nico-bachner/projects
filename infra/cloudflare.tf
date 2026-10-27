locals {
  cloudflare_account_id = "bc01cb67e58d38ab891c5391edb5834e"
}

resource "cloudflare_d1_database" "treasury" {
  account_id            = local.cloudflare_account_id
  name                  = "treasury"
  primary_location_hint = "oc"

  read_replication = {
    mode = "disabled"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "cloudflare_r2_bucket" "treasury" {
  account_id    = local.cloudflare_account_id
  name          = "treasury"
  jurisdiction  = "default"
  location      = "oc"
  storage_class = "Standard"

  lifecycle {
    prevent_destroy = true
  }
}

output "treasury_d1_database_id" {
  value = cloudflare_d1_database.treasury.id
}
