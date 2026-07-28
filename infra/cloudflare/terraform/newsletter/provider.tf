terraform {
  required_version = ">= 1.11.0" # use_lockfile (native S3 state locking) is GA in 1.11

  required_providers {
    cloudflare = {
      source = "cloudflare/cloudflare"
      # v5 schema: cloudflare_workers_script with a `bindings` list (incl. d1 /
      # secret_text bindings), cloudflare_workers_route, cloudflare_d1_database.
      version = "~> 5.21"
    }
  }
}

# Authenticated via the CLOUDFLARE_API_TOKEN environment variable (a scoped API
# token supplied per-environment by CI). The token needs, in addition to the
# existing permissions: D1 (Account, Edit). Workers Scripts (Account) and Workers
# Routes (Zone) are already granted. See docs/state-backend-and-credentials.md.
# account_id is passed per-resource from var.cloudflare_account_id.
provider "cloudflare" {}
