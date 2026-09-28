# Rendering episodes: the owner's steps

Episodes are drawn by Remotion on AWS Lambda. The Worker starts each render and asks how it is going; the finished MP4 goes straight into our R2 media bucket. You set this up once. Nothing here goes in the code or the repo: every key is a Worker secret.

## 1. Pick an AWS account and a region

- Use an AWS account the company owns.
- Pick one region, in the EU (for example `eu-central-1`) or the US (for example `us-east-1`). Rendering happens there, so choose where your users are. The privacy page must name AWS as a processor in that region.

## 2. The deploy user and role

Remotion prints the exact policies it needs:

```
npx remotion lambda policies role
npx remotion lambda policies user
```

- In IAM, create a role named `remotion-lambda-role` with the **role** policy.
- Create a user for deploying (for example `remotion-deploy`) with the **user** policy, and make an access key for it. You use these keys only on your own machine, when you deploy.

## 3. The Worker's own AWS user

The Worker gets a second user that can do one thing: start the render function.

- Create a user (for example `life-worker-render`) with this policy only:

  ```json
  {
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": "lambda:InvokeFunction",
        "Resource": "arn:aws:lambda:*:*:function:remotion-render-*"
      }
    ]
  }
  ```

- Make an access key for it and set both halves as Worker secrets (from `apps/api`):

  ```
  wrangler secret put REMOTION_AWS_ACCESS_KEY_ID
  wrangler secret put REMOTION_AWS_SECRET_ACCESS_KEY
  ```

## 4. An R2 token for the media bucket

Lambda reads each photo and clip through a link that lives 15 minutes, and writes the MP4 back into R2. Both need an R2 API token.

- In the Cloudflare dashboard, R2, Manage API tokens: create a token with **Object Read and Write**, limited to the `life-media` bucket only.
- Set it and your Cloudflare account id as Worker secrets:

  ```
  wrangler secret put R2_ACCOUNT_ID
  wrangler secret put R2_ACCESS_KEY_ID
  wrangler secret put R2_SECRET_ACCESS_KEY
  ```

## 5. Check how many renders can run at once

```
npx remotion lambda quotas --region <your region>
```

A new AWS account often allows only 10 Lambda functions at once, which can block even the first render. If the number is low, ask AWS for an increase (the command prints the link) and wait for it.

## 6. Deploy, set the secrets, render once

With the deploy user's keys in your shell (`REMOTION_AWS_ACCESS_KEY_ID` and `REMOTION_AWS_SECRET_ACCESS_KEY`, never written to a file in the repo) and `REMOTION_REGION` set:

```
pnpm --filter @life/render lambda:deploy
```

It creates Remotion's bucket (with folder expiry on), uploads the episode site and deploys the function (2048 MB memory, 2048 MB disk, 240 s timeout, logs kept 7 days). It prints three values. Set them as Worker secrets:

```
wrangler secret put REMOTION_REGION
wrangler secret put REMOTION_FUNCTION_NAME
wrangler secret put REMOTION_SERVE_URL
```

Use `wrangler secret put` for all of them. Variables typed into the dashboard are wiped by the next deploy.

Then:

- In the S3 console, open the bucket whose name starts with `remotionlambda-` and check its lifecycle rules: there should be `delete-after-1-day` and its siblings. Render folders, which hold the episode's render input, are removed after a day.
- Render one real episode and watch it: that it finishes, that the MP4 lands under `u/…/episodes/` in R2, how long it took, and what it cost against the ledger. Listen to it on a phone too; Remotion has an open issue about audio arriving about 43 ms late (remotion#11704).

## 7. The Remotion licence

Remotion is free for a company of up to 3 people. When the team grows past that, a company licence is needed, and its per-render cost is added to the ledger then.
