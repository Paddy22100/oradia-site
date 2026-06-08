/**
 * Script de création d'utilisateur dans Supabase Auth
 * Usage: node server/scripts/create-supabase-user.js
 * 
 * Ce script crée l'utilisateur contact@oradia.fr avec le mot de passe Oradia2026!
 * et l'enregistre dans la table tore_subscriptions
 */

const { createClient } = require('@supabase/supabase-js');

// Configuration Supabase
const SUPABASE_URL = 'https://bwvlpgklnhcwkdpabiwd.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY manquante. Définir la variable d\'environnement avant d\'exécuter ce script.');
  process.exit(1);
}

const USER_DATA = {
  email: 'contact@oradia.fr',
  password: 'Oradia2026!',
  fullName: 'Contact Oradia'
};

async function createUser() {
  try {
    console.log('🚀 Connexion à Supabase...');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // 1. Vérifier si l'utilisateur existe déjà dans Auth
    console.log(`🔍 Vérification de ${USER_DATA.email}...`);
    const { data: existingUsers, error: listError } = await supabase.auth.admin.listUsers();
    
    if (listError) {
      console.error('❌ Erreur lors de la vérification:', listError.message);
      return;
    }
    
    const existingUser = existingUsers?.users?.find(u => u.email === USER_DATA.email);
    
    if (existingUser) {
      console.log(`⚠️  L'utilisateur ${USER_DATA.email} existe déjà dans Auth.`);
      console.log('   ID:', existingUser.id);
    } else {
      // 2. Créer l'utilisateur dans Supabase Auth
      console.log(`➕ Création de l'utilisateur ${USER_DATA.email}...`);
      const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
        email: USER_DATA.email,
        password: USER_DATA.password,
        email_confirm: true,
        user_metadata: {
          full_name: USER_DATA.fullName,
          subscription_type: 'tore',
          subscription_active: true
        }
      });
      
      if (authError) {
        console.error('❌ Erreur création Auth:', authError.message);
        return;
      }
      
      console.log('✅ Utilisateur créé dans Supabase Auth');
      console.log('   ID:', authUser.user.id);
    }
    
    // 3. Vérifier/insérer dans la table tore_subscriptions
    console.log('🔍 Vérification dans tore_subscriptions...');
    const { data: existingSub, error: subCheckError } = await supabase
      .from('tore_subscriptions')
      .select('id')
      .eq('email', USER_DATA.email)
      .single();
    
    if (existingSub) {
      console.log('⚠️  Déjà présent dans tore_subscriptions');
      
      // Mettre à jour le statut
      const { error: updateError } = await supabase
        .from('tore_subscriptions')
        .update({ 
          status: 'active',
          full_name: USER_DATA.fullName,
          updated_at: new Date().toISOString()
        })
        .eq('email', USER_DATA.email);
      
      if (updateError) {
        console.error('❌ Erreur mise à jour:', updateError.message);
      } else {
        console.log('✅ Statut mis à jour : active');
      }
    } else {
      // Insérer dans la table
      console.log('➕ Insertion dans tore_subscriptions...');
      const { error: insertError } = await supabase
        .from('tore_subscriptions')
        .insert({
          email: USER_DATA.email,
          full_name: USER_DATA.fullName,
          status: 'active',
          temp_password: USER_DATA.password, // Stocké pour référence
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      
      if (insertError) {
        console.error('❌ Erreur insertion:', insertError.message);
        return;
      }
      
      console.log('✅ Enregistré dans tore_subscriptions');
    }
    
    // Résumé
    console.log('\n' + '='.repeat(50));
    console.log('✅ COMPTE CRÉÉ AVEC SUCCÈS');
    console.log('='.repeat(50));
    console.log(`Email:    ${USER_DATA.email}`);
    console.log(`Password: ${USER_DATA.password}`);
    console.log(`Status:   Active (Tore subscription)`);
    console.log('='.repeat(50));
    console.log('\n🎯 Tu peux maintenant te connecter sur :');
    console.log('   → oradia.fr/member/abonnements.html');
    console.log('\n');
    
  } catch (error) {
    console.error('\n❌ ERREUR FATALE:', error.message);
    console.log('\n💡 Si c\'est une erreur de clé API, vérifie que :');
    console.log('   1. Tu utilises la SERVICE_ROLE_KEY (pas l\'anon key)');
    console.log('   2. La clé est correcte dans Project Settings > API');
    process.exit(1);
  }
}

createUser();
