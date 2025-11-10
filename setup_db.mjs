import PocketBase from 'pocketbase'
import fs from 'fs'
import path from 'path'
import { configDotenv } from 'dotenv'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url';
import { dirname } from 'path';

configDotenv()

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


const host = process.env.POCKETBASE_ADDR
const pb = new PocketBase(host)

const schemaPath = path.resolve('./pb_schema.json')
const dataPath = path.resolve('./pb_data')
const email = process.env.EMAIL
const password = process.env.PASSWORD

async function createSuperuser() {
  return new Promise((resolve, reject) => {
    console.log('Creating superuser via Docker CLI...')

    const docker = spawn('docker', [
      'exec',
      '-i',
      'opensound-pocketbase',
      '/pb/pocketbase',
      'superuser',
      'upsert',
      email,
      password
    ]);

    docker.stdout.on('data', (data) => {
      console.log(data.toString().trim())
    })

    docker.stderr.on('data', (data) => {
      console.error(data.toString().trim())
    })

    docker.on('close', (code) => {
      if (code === 0) {
        console.log('Superuser created/updated successfully')
        resolve()
      } else {
        console.log(`Command exited with code ${code}`)
        resolve()
      }
    })

    docker.on('error', (error) => {
      console.error('Failed to execute docker command:', error.message)
      reject(error)
    })
  })
}

async function authenticateWithRetry(maxRetries = 5, delayMs = 5000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      console.log(`Authenticating (attempt ${i + 1}/${maxRetries})...`)
      await pb.collection('_superusers').authWithPassword(email, password)
      console.log('Authenticated successfully')
      return true
    } catch (error) {
      if (i < maxRetries - 1) {
        console.log(`Failed, waiting ${delayMs}ms before retry...`)
        await new Promise(r => setTimeout(r, delayMs))
      } else {
        throw error
      }
    }
  }
  return false
}

async function setupDB() {
  console.log('running...')

  const initFile = path.join(__dirname, '.initialized')

  if (fs.existsSync(initFile)) {
    console.log('Database already initialized')
    return
  }

  // Wait for PocketBase to be ready
  await new Promise(r => setTimeout(r, 2000))

  // Create superuser via Docker CLI
  try {
    await createSuperuser()
  } catch (error) {
    console.error('Failed to create superuser:', error.message)
    console.error('\nTrying to continue anyway...')
  }

  // Wait longer for the database to sync
  console.log('\nWaiting for database to sync...')
  await new Promise(r => setTimeout(r, 3000))

  // Authenticate with retry
  try {
    await authenticateWithRetry()
  } catch (error) {
    console.error('\nAuthentication failed after retries:', error.message)
    console.error('\nThe superuser was created but authentication is failing.')
    console.error('This might be a database issue. Try:')
    console.error('  1. Restart the PocketBase container:')
    console.error('     docker restart youthful_joliot')
    console.error('  2. Wait a few seconds, then run this script again')
    console.error('\nOr check the PocketBase logs:')
    console.error('     docker logs youthful_joliot')
    process.exit(1)
  }

  // Create collections from schema
  if (fs.existsSync(schemaPath)) {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'))
    console.log(`\nCreating ${schema.length} collections...`)

    for (const c of schema) {
      try {
        await pb.collections.create(c)
        console.log(`Created collection: ${c.name}`)
      } catch (error) {
        if (error.message?.includes('already exists')) {
          console.log(`Collection already exists: ${c.name}`)
        } else {
          console.error(`Failed to create collection ${c.name}:`, error.message)
        }
      }
    }
  }

  fs.writeFileSync(initFile, 'true')
  console.log('\n✅ Setup complete!')
}

setupDB()