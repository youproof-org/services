terraform {
  required_version = ">= 1.11.0" # use_lockfile (native S3 state locking) is GA in 1.11

  required_providers {
    cloudflare = {
      source = "cloudflare/cloudflare"
      # v5 is a generated-from-OpenAPI rewrite of the provider; resource and
      # attribute names differ substantially from v4. The worker.tf / routes.tf
      # in this module target the v5 schema (cloudflare_workers_script with a
      # `bindings` list, cloudflare_workers_route). Pin to the v5 major.
      version = "~> 5.21"
    }
  }
}

# The provider is authenticated via the CLOUDFLARE_API_TOKEN environment
# variable (a scoped API token), supplied per-environment by CI. We deliberately
# do NOT put the token in a Terraform variable so it never lands in state or
# plan output. account_id is passed per-resource from var.cloudflare_account_id.
provider "cloudflare" {}
