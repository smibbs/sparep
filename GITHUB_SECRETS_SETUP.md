# GitHub Secrets Setup for Supabase

## 🔐 Setting Up GitHub Secrets

To fix the mobile authentication issue on nanotopic.co.uk, you need to add your Supabase credentials as GitHub Secrets so they can be injected during deployment.

### Step 1: Get Your Supabase Credentials

1. **Open your local `config/supabase-config.js` file**
2. **Copy the values** for:
   - `SUPABASE_URL` (looks like: `https://your-project.supabase.co`)
   - `SUPABASE_ANON_KEY` (long string starting with `eyJ...`)

### Step 2: Add GitHub Secrets

1. **Go to your GitHub repository**: https://github.com/your-username/sparep
2. **Click "Settings"** tab (at the top of the repo)
3. **Click "Secrets and variables"** in the left sidebar
4. **Click "Actions"**
5. **Click "New repository secret"**

### Step 3: Create Two Secrets

**Secret 1:**
- **Name**: `SUPABASE_URL`
- **Value**: Your Supabase URL (e.g., `https://abcdefg.supabase.co`)

**Secret 2:**
- **Name**: `SUPABASE_ANON_KEY` 
- **Value**: Your Supabase anonymous key (the long string)

⚠️ **Important**: Make sure the secret names are EXACTLY `SUPABASE_URL` and `SUPABASE_ANON_KEY` (case-sensitive)

### Step 4: Test the Deployment

1. **Commit and push** your changes (the updated deploy.yml)
2. **Go to Actions tab** in GitHub to watch the deployment
3. **Check the logs** - you should see: `✅ Supabase config created successfully`
4. **Test nanotopic.co.uk/login.html** on mobile - the 404 error should be gone!

## 🔍 Verification

After deployment, the GitHub Action will:
1. ✅ Create `config/supabase-config.js` during build
2. ✅ Inject your credentials securely 
3. ✅ Deploy to nanotopic.co.uk with the config file included

The file will be created automatically and won't appear in your repository (keeping secrets secure).

## 🚨 Security Notes

- ✅ **Secrets are encrypted** in GitHub and only accessible during Actions
- ✅ **Not visible in repository** or commit history
- ✅ **Only used during deployment** to create the config file
- ✅ **Config file never committed** to git (still in .gitignore)

## 📋 Quick Checklist

- [ ] Found SUPABASE_URL and SUPABASE_ANON_KEY in local config
- [ ] Added both secrets to GitHub repository settings
- [ ] Committed and pushed the updated deploy.yml workflow
- [ ] Watched GitHub Actions deployment complete successfully
- [ ] Tested https://nanotopic.co.uk/login.html - no more 404 error
- [ ] Mobile authentication now works on production

This approach keeps your credentials secure while ensuring the production site has the necessary configuration to authenticate users!