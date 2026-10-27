variable "state_passphrase" {
  description = "Passphrase that encrypts state and plans. At least 16 characters."
  type        = string
  sensitive   = true
}

variable "previous_state_passphrase" {
  description = "Passphrase the state was encrypted with before the current one, used to decrypt it once."
  type        = string
  sensitive   = true
}

variable "r2_access_key_id" {
  description = "R2 access key for the tofu-state bucket, stored for CI."
  type        = string
  sensitive   = true
}

variable "r2_secret_access_key" {
  description = "R2 secret key for the tofu-state bucket, stored for CI."
  type        = string
  sensitive   = true
}

variable "github_admin_token" {
  description = "GitHub token with administration access to projects, stored for CI."
  type        = string
  sensitive   = true
}

variable "homebrew_tap_token" {
  description = "GitHub token with contents write access to homebrew-tap."
  type        = string
  sensitive   = true
}
