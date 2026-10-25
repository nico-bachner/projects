import {
  to = github_repository.projects
  id = "projects"
}

import {
  to = github_branch_default.projects
  id = "projects"
}

import {
  to = github_repository_vulnerability_alerts.projects
  id = "projects"
}

resource "github_repository" "projects" {
  name         = "projects"
  description  = "A home for all my personal projects"
  homepage_url = ""
  topics       = []
  visibility   = "public"
  archived     = false
  is_template  = false
  auto_init    = false

  has_issues      = true
  has_projects    = true
  has_wiki        = false
  has_discussions = false

  allow_merge_commit          = false
  allow_rebase_merge          = false
  allow_squash_merge          = true
  allow_auto_merge            = true
  allow_update_branch         = false
  allow_forking               = true
  merge_commit_title          = "MERGE_MESSAGE"
  merge_commit_message        = "PR_TITLE"
  squash_merge_commit_title   = "PR_TITLE"
  squash_merge_commit_message = "PR_BODY"
  delete_branch_on_merge      = true
  web_commit_signoff_required = false

  security_and_analysis {
    secret_scanning {
      status = "disabled"
    }
    secret_scanning_push_protection {
      status = "disabled"
    }
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "github_branch_default" "projects" {
  repository = github_repository.projects.name
  branch     = "main"
}

resource "github_repository_vulnerability_alerts" "projects" {
  repository = github_repository.projects.name
  enabled    = true
}

resource "github_workflow_repository_permissions" "projects" {
  repository                       = github_repository.projects.name
  default_workflow_permissions     = "read"
  can_approve_pull_request_reviews = false
}

resource "github_repository_ruleset" "main" {
  name        = "main"
  repository  = github_repository.projects.name
  target      = "branch"
  enforcement = "active"

  conditions {
    ref_name {
      include = ["~DEFAULT_BRANCH"]
      exclude = []
    }
  }

  rules {
    creation                = false
    update                  = false
    deletion                = true
    non_fast_forward        = true
    required_linear_history = false
    required_signatures     = false

    required_status_checks {
      strict_required_status_checks_policy = false
      do_not_enforce_on_create             = false

      required_check {
        context        = "ci"
        integration_id = 0
      }
    }
  }
}

locals {
  actions_secrets = {
    AWS_ACCESS_KEY_ID       = var.r2_access_key_id
    AWS_SECRET_ACCESS_KEY   = var.r2_secret_access_key
    HOMEBREW_TAP_TOKEN      = var.homebrew_tap_token
    TF_VAR_state_passphrase = var.state_passphrase
    TOFU_GITHUB_TOKEN       = var.github_admin_token
  }
}

resource "github_actions_secret" "projects" {
  for_each = nonsensitive(toset(keys(local.actions_secrets)))

  repository  = github_repository.projects.name
  secret_name = each.key
  value       = local.actions_secrets[each.key]
}
