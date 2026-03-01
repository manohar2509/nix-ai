import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Amplify } from 'aws-amplify'
import { amplifyConfig } from './config/amplify'
import './index.css'
import App from './App.jsx'
import AuthProvider from './context/AuthProvider'

// ── Initialize AWS Amplify (Cognito connection) ──
Amplify.configure(amplifyConfig)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
