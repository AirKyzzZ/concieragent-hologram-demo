# 2060 Demos Deployment – Multi-Environment Guide

This repository contains deployment configurations for 2060 demos, managed entirely through GitHub Actions workflows. All deployments—development, production, and other environments—are controlled via CI/CD pipelines to ensure consistency and reliability. **Direct Helm commands are not used; all deployments must go through the provided GitHub Actions workflows.**

# Quick Navigation

- Onboarding (For New Demos Only)
  - [Add a New Demo](#add-a-new-demo)
  - [Required Structure for All Values Files](#required-structure-for-all-values-files)
  - [Global Domain Behavior](#global-domain-behavior)
  - [Environment Overrides (dev → prod)](#environment-overrides-dev--prod)
  - [Release Naming](#release-naming)
  - [Branching & Promotion Flow](#branching--promotion-flow)

- Deployment & Operations Manual (For Maintainers Only)
  - [Production Deployment (MUST READ)](#production-deployment-must-read)
  - [Prerequisites](#prerequisites)
  - [Deployment Steps](#deployment-steps)
    - [Remove Old Resources (First-Time Deployment Only)](#remove-old-resources-first-time-deployment-only)
    - [Configure Values for Each Environment](#configure-values-for-each-environment)
    - [Deploy via GitHub Actions](#deploy-via-github-actions)
    - [Merge to Main](#merge-to-main)
    - [Validate Deployment in the Dashboard](#validate-deployment-in-the-dashboard)

- Common Tasks & Utilities
  - [Use Manual CI Workflows](#use-manual-ci-workflows)

- Overview of Deployment Files
  - [WebRTC Web Client](#webrtc-web-client-deployment)
  - [WebRTC Server](#webrtc-server-deployment)
  - [Vision Service](#vision-service-deployment)
  - [PyMediasoup Client](#pymediasoup-client-deployment)
  - [Hologram Gov ID Issuer](#hologram-government-id-issuer-deployment)
  - [Hologram Gov ID Verifier](#hologram-government-id-verifier-deployment)

- CI/CD Workflows
  - [Continuous Deployment (`cd.yml`)](#continuous-deployment-cd.yml)
  - [Manual Install/Uninstall (`install.yml`, `uninstall.yml`)](#manual-installuninstall-install.yml-uninstall.yml)

- Notes
  - [Notes](#notes)


---

## Onboarding (For New Demos Only)
### 🆕 **Add a New Demo**

To add a new demo to this repository, you only need to provide a **Helm values file** that defines how your demo should be deployed.
This repository does *not* contain application code Wonly deployment configuration.

Before adding your demo, ensure that:

* Your application already has a **Helm chart** (published or accessible through an OCI registry).
* Your application already has a **Docker image** available for deployment.

#### Required Structure for All Values Files

Every demo **must** include the following fields at the top of its values file.
Without these keys **the deployment will not work correctly**, since the CI/CD workflow relies on them:

```yaml
# === Global chart version ===
# This version controls which Helm chart version will be deployed.
# It must be updated anytime the chart itself changes.
chartSource: oci://registry-1.docker.io/io2060/webrtc-server-chart
chartVersion: v1.1.0
```

These fields are **mandatory** for *all* demos in `values/` and `prod/`.

#### Global Domain Behavior

All charts must support:

```yaml
global:
  domain: example.2060.io
```

However, **this value is always overridden automatically** by the CI/CD pipeline:

| Environment | Domain used         |
| ----------- | ------------------- |
| **dev**     | `demos.dev.2060.io` |
| **prod**    | `demos.2060.io`     |

No chart or values file should hardcode its domain, it will always be replaced.

---

#### Environment Overrides (dev → prod)

The `prod/` folder acts as an **override** of the base values in `values/`.
This means:

* You **do not need to repeat variables** in `prod/<demo>.yaml` if they already exist in `values/<demo>.yaml`.
* Only environment-specific overrides should be placed in `prod/`.
* If a value is not defined in `prod/`, the dev version from `values/` will be reused automatically.

---

#### Release Naming

The **release name is automatically derived from the filename** of the values file.

Examples:

| File name            | Release name |
| -------------------- | ------------ |
| `values/webrtc.yaml` | `webrtc`     |
| `prod/payments.yaml` | `payments`   |

Because of this: the filename becomes the canonical reference for your demo.

> **Note:** Manual Deployment Files Must Reference the Same Name

Since the **file name = release name**, you must add the same name to all manual deployment workflow files:

* `install.yml`
* `promote-values.yml`
* `uninstall.yml`

Any mismatch will cause manual actions to fail.

Example:

If your values file is named `webrtc.yaml`, then all workflow files must refer to the release `webrtc`.

#### Branching & Promotion Flow

All new demos must follow this flow:

1. **Create your PR against the `dev` branch.**
2. CI/CD will validate the demo via the dev environment deployment.
3. Once approved and validated, the maintainers will promote it to **production** via the promote pipeline.
4. Only demos that pass all requirements and checks will reach `prod`.

No direct PRs to `prod` are allowed.

---

## Deployment & Operations Manual (For Maintainers Only)

### 💥 **🚨 MUST READ: PRODUCTION DEPLOYMENT 🚨**

> ⚠️ **This section is required reading before any production deployment.**
> Skipping this can cause critical downtime or misconfiguration.
> *Even if you're familiar with Helm or Kubernetes — please read.*

### ✅ Production Deployment Guide
This guide provides step-by-step instructions for deploying 2060 demos to any environment, including production. All deployments are managed through GitHub Actions workflows.

#### Prerequisites

1. **GitHub Secrets Configuration**
   * Set the following required in your GitHub environment:
     * `DOMAIN` (variable): The primary domain name used in your deployment (e.g., `example.com`).
     * `KUBECONFIG` (secret): The base64-encoded contents of your kubeconfig file used to connect to the target Kubernetes cluster.
   * Add these in:  
     `Repository > Environments > <environment> > Secrets and variables > Variables (or Secrets) > New variable (or New secret)`

2. **GitHub Access**
   * Ensure you have access to the repository and permissions to push to the relevant branch (`main` for production, `dev` for development).

3. **TLS Certificates**
   * Ensure TLS certificates are available for all domains used in the deployment.

4. **Optional: Kubernetes Dashboard Access**
   * For monitoring or troubleshooting, ensure you have access to the Kubernetes dashboard or equivalent tools.

#### Deployment Steps
##### 🚀 1. Remove Old Resources (First-Time Deployment Only)
If this is the first deployment or if old resources need to be removed.

---

##### 🚀 2. Configure Values for Each Environment
Each component has a corresponding values file in the [`values/`](./values/) directory. For production-specific overrides, use the new [`prod/`](./prod/) directory.  
- Update parameters such as namespace, replicas, domain, and secrets in the respective files.
- For production, you can place override files in `prod/` (e.g., `prod/webrtc-server-chart.yaml`) to customize settings without modifying the base values.

- Namespace: Use a production namespace (e.g., `demos`).
- Replicas: Increase replicas for high availability (e.g., `replicas: 3`).
- Domain: Update the domain to the production domain (e.g., `2060.io`).
- Secrets: Replace placeholder secrets with actual production secrets.

Example for [`hologram-gov-id-issuer-vs-chart.yaml`](./values/hologram-gov-id-issuer-vs-chart.yaml):
```yaml
replicas: 1
database:
  host: gov-id-issuer-db
  user: prod-user
  pwd: <base64-encoded-password>
```

---

##### 🚀 3. Deploy via GitHub Actions
- Create a new branch from `main` (for production) or `dev` (for development):
   ```bash
   git checkout -b <feature-branch-name>
```

- Update the corresponding `values` file in the `values/` directory with the desired configuration for production. Use the development environment values as a reference to ensure consistency.

- Push your branch to the repository:
   ```bash
   git push origin <feature-branch-name>
   ```
- Open a pull request (PR) to the `main` branch. Ensure the PR is reviewed and approved before merging.

---

##### 🚀 4. **Merge to Main**:
   - Once the PR is merged into `main`, the CI/CD pipeline will automatically deploy the updated components to the production environment.

> **Note**: Avoid using Helm commands directly to deploy components. Instead, rely on the repository's CI/CD integration to manage deployments and ensure consistency across releases.

---

##### 🚀 5. Validate Deployment in the Dashboard

After the CI/CD pipeline completes the deployment, validate the deployment using the Kubernetes dashboard or equivalent monitoring tools:

1. **Access the Dashboard**:
   - Use the Kubernetes dashboard or a similar tool to monitor the status of the deployed components.

2. **Check Resources**:
   - Verify that all pods, services, and ingress resources are running as expected.

3. **Test Endpoints**:
   - Access the application via the configured domain to ensure it is reachable and functioning correctly.

---

## Common Tasks & Utilities
### Use Manual CI Workflows

If necessary, you can manually trigger CI workflows to install or uninstall services:

1. **Manual Installation**:
   - Trigger the `install.yml` workflow from the GitHub Actions interface.
- Select the desired values file and namespace.
- For production, the workflow will automatically use overrides from the `prod/` directory if present.

2. **Manual Uninstallation**:
   - Trigger the `uninstall.yml` workflow from the GitHub Actions interface to remove specific services.

> **Note**: These manual workflows are useful for testing or troubleshooting specific components without affecting the entire system.

## Overview of Deployment Files

### 1. **WebRTC Web Client Deployment**
- **File**: `values/webrtc-client-chart.yaml`
- **Description**: Contains the configuration for deploying the WebRTC web client, including namespace, ConfigMap, secrets, deployment settings, service, and ingress.

### 2. **WebRTC Server Deployment**
- **File**: `values/webrtc-server-chart.yaml`
- **Description**: Defines the deployment settings for the WebRTC server, including StatefulSet configuration, environment variables, and ingress.

### 3. **Vision Service Deployment**
- **File**: `values/vision-service-chart.yaml`
- **Description**: Manages the deployment of the Vision Service and its associated Vision Matcher component. Includes StatefulSet, ingress, and service configurations.

### 4. **PyMediasoup Client Deployment**
- **File**: `values/pymediasoup-client-chart.yaml`
- **Description**: Contains the deployment configuration for the PyMediasoup client, including environment variables and domain settings.

### 5. **Hologram Government ID Issuer Deployment**
- **File**: `values/hologram-gov-id-issuer-vs-chart.yaml`
- **Description**: Configures the deployment of the Gov ID Issuer, including database settings, backend configurations, and associated VS Agent.

### 6. **Hologram Government ID Verifier Deployment**
- **File**: `values/hologram-gov-id-verifier-chart.yaml`
- **Description**: Manages the deployment of the Gov ID Verifier, including VS Agent settings, service configurations, and ingress.

## CI/CD Workflows

All deployments are managed via GitHub Actions workflows in the `.github/workflows/` directory:

- **Continuous Deployment (`cd.yml`):**  
  Runs on every push to `main` or `dev`. Builds Docker images, detects changes in values files, and deploys only modified components. Uses overrides from `prod/` for production.

- **Manual Install/Uninstall (`install.yml`, `uninstall.yml`):**  
  Can be triggered manually. Allows selection of values files and namespace. Uses `prod/` overrides for production.

## Notes

- Do not run Helm commands directly; use the provided GitHub Actions workflows.
- For production-specific configuration, use the `prod/` directory for overrides.
- All deployment-related files must be placed in the appropriate directories (`values/`, `prod/`).

For more details, refer to the `.github/workflows` directory in the repository.