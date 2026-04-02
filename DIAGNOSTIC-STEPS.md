# 🔍 DIAGNOSTIC WEBHOOK STRIPE - ÉTAPES À SUIVRE

## 🚨 PROBLÈME ACTUEL
- Supabase ne se met pas à jour
- Email de confirmation ne part pas
- Dernière commande n'apparaît pas

## 📋 ÉTAPES DE DIAGNOSTIC

### 1. **Vérifier si le webhook est atteint**
```bash
# Ouvrir dans le navigateur:
https://oradia.fr/api/test-webhook
```
**Résultat attendu**: JSON avec status des variables et tests de connexion

### 2. **Vérifier les variables d'environnement Vercel**
Aller dans dashboard Vercel → Project → Settings → Environment Variables
Vérifier que ces variables sont présentes:
- ✅ STRIPE_SECRET_KEY
- ✅ STRIPE_WEBHOOK_SECRET  
- ✅ SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_URL
- ✅ SUPABASE_SERVICE_ROLE_KEY
- ✅ BREVO_API_KEY
- ✅ BREVO_SENDER_EMAIL

### 3. **Vérifier la configuration webhook Stripe**
Aller dans dashboard Stripe → Webhooks:
- **Endpoint URL**: `https://oradia.fr/api/stripe-webhook`
- **HTTP method**: POST
- **Events**: `checkout.session.completed`
- **Signing secret**: Doit correspondre à `STRIPE_WEBHOOK_SECRET`

### 4. **Tester localement avec le script de debug**
```bash
cd "d:\Ma quête de sens\Mes projets et pistes\Oradia\Oracle Oradia\SiteOradia\oradia-site-Travail"
node debug-webhook.js
```

### 5. **Faire un test de paiement et analyser les logs**
1. Faire une commande de test sur le site
2. Aller dans Vercel → Functions → Runtime logs
3. Chercher les logs avec les emojis: 🔍, 🛒, 📦, ❌, ✅

**Logs attendus**:
```
🔍 AUDIT VARIABLES ENVIRONNEMENT: ✅
🎯 Webhook event: checkout.session.completed ✅
🛒 AUDIT CHECKOUT SESSION COMPLETED ✅
📦 Payload upsert (brut): {...} ✅
🚨 ENVOI VERS SUPABASE... ✅
✅ Upsert réussi: ✅
📧 Appel de sendBrevoEmail ✅
✅ Email sent successfully via Brevo ✅
```

### 6. **Vérifier la table Supabase**
```sql
-- Dans Supabase SQL Editor:
SELECT * FROM preorders ORDER BY created_at DESC LIMIT 5;
```

### 7. **Problèmes courants et solutions**

#### A. **Variables manquantes**
**Symptôme**: `❌ MANQUANTE` dans les logs
**Solution**: Ajouter les variables dans Vercel dashboard

#### B. **Mauvaise URL webhook Stripe**
**Symptôme**: Aucun log dans Vercel après paiement
**Solution**: 
1. Vérifier l'URL dans Stripe webhook
2. Retester le webhook dans Stripe dashboard

#### C. **Permissions Supabase (RLS)**
**Symptôme**: `❌ ERREUR PERMISSION: Problème de permissions RLS`
**Solution**: 
```sql
-- Dans Supabase SQL Editor:
ALTER TABLE preorders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all operations for service role" ON preorders;
CREATE POLICY "Allow all operations for service role" ON preorders
    FOR ALL USING (auth.role() = 'service_role');
```

#### D. **Contrainte NOT NULL**
**Symptôme**: `❌ ERREUR NOT NULL: Un champ requis est manquant`
**Solution**: Vérifier que tous les champs requis sont envoyés

#### E. **Brevo API key invalide**
**Symptôme**: `❌ Brevo API error: 401 Unauthorized`
**Solution**: Vérifier la clé API Brevo

## 🎯 ACTIONS IMMÉDIATES

1. **Exécuter le test webhook**: `https://oradia.fr/api/test-webhook`
2. **Vérifier les logs Vercel** après un paiement test
3. **Envoyer les logs complets** pour analyse

## 📞 Si problème persiste

Fournir:
- Screenshot du résultat de `/api/test-webhook`
- Logs Vercel complets après paiement test
- Screenshot de la configuration webhook Stripe
