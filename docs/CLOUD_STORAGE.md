# Cloud PDF Storage

Pricing checked: 2026-07-11. Provider prices and free tiers can change; verify the linked official page before purchasing.

## Practical Capacity

Academic PDFs commonly occupy 3-20 MB. Using 10 MB as a planning average:

| Storage | Approximate papers |
| --- | ---: |
| 1 GB | 100 |
| 10 GB | 1,000 |
| 100 GB | 10,000 |
| 1 TB | 100,000 |

Object storage is not computer memory. Paperfield keeps the durable PDF in the cloud and downloads recently opened files into a bounded local cache. `PAPERFIELD_LOCAL_CACHE_MAX_MB` defaults to 2048 MB.

## Provider Comparison

| Provider | Included or free storage | Storage after allowance | Download traffic | Best fit |
| --- | --- | --- | --- | --- |
| Cloudflare R2 | 10 GB-month each month | $0.015/GB-month Standard | Free internet egress | Best default for a personal paper library |
| Backblaze B2 | First 10 GB free | $0.00695/GB-month | Free up to 3x average stored volume, then provider rates | Lowest storage cost |
| AWS S3 Standard, us-east-1 | No permanent allowance assumed here | $0.023/GB-month for first 50 TB | Requests and egress billed separately | Mature enterprise ecosystem |
| Supabase Storage | Free plan includes 1 GB | Pro starts at $25/month, includes 100 GB, then $0.0213/GB | Pro includes 250 GB egress | Future login and multi-user deployment |

Official sources:

- [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- [Backblaze B2 pricing](https://www.backblaze.com/cloud-storage/pricing)
- [AWS S3 pricing](https://aws.amazon.com/s3/pricing/)
- [Supabase pricing](https://supabase.com/pricing)
- [Supabase S3 compatibility](https://supabase.com/docs/guides/storage/s3/compatibility)

At 10 GB, R2 and B2 are normally within their free storage allowances. At 100 GB, storage alone is approximately $1.35/month on R2 after its 10 GB allowance, $0.63/month on B2 after its 10 GB allowance, and $2.30/month on AWS S3 Standard. Requests, taxes, region differences, and traffic policies are not included in these estimates.

For mainland-China access, Alibaba Cloud OSS and Tencent Cloud COS may offer better latency. Their prices and S3 compatibility vary by region and product configuration, so Paperfield treats them as advanced S3-compatible endpoints rather than publishing one misleading global price.

## Paperfield Configuration

Paperfield never sends object-storage credentials to browser JavaScript. For a local installation, place them in the ignored `.env` file at the project root; Docker Compose reads the same file. Environment variables remain supported:

```env
PAPERFIELD_S3_PROVIDER=Cloudflare R2
PAPERFIELD_S3_ENDPOINT=https://ACCOUNT_ID.r2.cloudflarestorage.com
PAPERFIELD_S3_REGION=auto
PAPERFIELD_S3_BUCKET=paperfield-private
PAPERFIELD_S3_ACCESS_KEY_ID=...
PAPERFIELD_S3_SECRET_ACCESS_KEY=...
PAPERFIELD_LOCAL_CACHE_MAX_MB=2048
PAPERFIELD_R2_BILLING_CYCLE_DAY=11
```

For AWS S3, leave `PAPERFIELD_S3_ENDPOINT` blank and set the real AWS region. For Backblaze B2, use its S3 endpoint and region. The bucket must remain private; Paperfield reads and writes it through server-side credentials.

After restarting Paperfield, open **存储与用量** in the left rail. Set the billing-cycle start day to the day shown by the Cloudflare dashboard, choose the local PDF directory and cache limit, and use **重新清点** to establish the first bucket inventory. Paperfield counts its own `PutObject`, `GetObject`, and `ListObjectsV2` requests exactly; Cloudflare dashboard requests or other clients are outside that counter. The capacity estimate uses the latest bucket scan, while Cloudflare bills average GB-month usage.

## Recommended Choice

Start with local storage while building the reading habit. When cached PDFs approach 10-20 GB, use Cloudflare R2 if simple downloads and predictable egress matter most, or Backblaze B2 if minimum storage price matters most. Supabase becomes attractive later when Paperfield also needs authentication, shared user data, and a hosted database.
