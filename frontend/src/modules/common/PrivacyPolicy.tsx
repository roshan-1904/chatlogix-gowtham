import React from 'react'

export function PrivacyPolicy() {
  return (
    <div style={{ 
      maxWidth: '800px', 
      margin: '0 auto', 
      padding: '2rem',
      background: 'white',
      borderRadius: '12px',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
      lineHeight: '1.6'
    }}>
      <h1 style={{ 
        color: '#1e293b',
        fontSize: '2.5rem',
        fontWeight: '700',
        marginBottom: '1rem',
        textAlign: 'center'
      }}>
        Privacy Policy
      </h1>
      
      <p style={{ 
        color: '#64748b',
        fontSize: '1.1rem',
        marginBottom: '2rem',
        textAlign: 'center'
      }}>
        Last updated: {new Date().toLocaleDateString()}
      </p>

      <div style={{ color: '#374151', fontSize: '1rem' }}>
        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ color: '#1e293b', fontSize: '1.5rem', marginBottom: '1rem' }}>1. Introduction</h2>
          <p>
            ChatLogix ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our WhatsApp Commerce Management Platform.
          </p>
        </section>

        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ color: '#1e293b', fontSize: '1.5rem', marginBottom: '1rem' }}>2. Information We Collect</h2>
          <h3 style={{ color: '#374151', fontSize: '1.2rem', marginBottom: '0.5rem' }}>2.1 WhatsApp Data</h3>
          <ul style={{ marginLeft: '1.5rem', marginBottom: '1rem' }}>
            <li>Phone numbers and contact information</li>
            <li>Message content (text, images, audio, documents)</li>
            <li>Message timestamps and delivery status</li>
            <li>Customer conversation history</li>
          </ul>
          
          <h3 style={{ color: '#374151', fontSize: '1.2rem', marginBottom: '0.5rem' }}>2.2 Business Data</h3>
          <ul style={{ marginLeft: '1.5rem', marginBottom: '1rem' }}>
            <li>Business information and contact details</li>
            <li>Product catalogs and order information</li>
            <li>Customer insights and analytics</li>
            <li>Usage statistics and performance metrics</li>
          </ul>
        </section>

        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ color: '#1e293b', fontSize: '1.5rem', marginBottom: '1rem' }}>3. How We Use Your Information</h2>
          <p>We use the collected information to:</p>
          <ul style={{ marginLeft: '1.5rem' }}>
            <li>Provide and maintain our WhatsApp Commerce services</li>
            <li>Process and manage customer conversations</li>
            <li>Generate automated responses using AI technology</li>
            <li>Analyze customer interactions and provide insights</li>
            <li>Manage orders and transactions</li>
            <li>Improve our services and develop new features</li>
            <li>Ensure compliance with applicable laws and regulations</li>
          </ul>
        </section>

        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ color: '#1e293b', fontSize: '1.5rem', marginBottom: '1rem' }}>4. Data Sharing and Disclosure</h2>
          <p>We do not sell, trade, or rent your personal information. We may share information only:</p>
          <ul style={{ marginLeft: '1.5rem' }}>
            <li>With your explicit consent</li>
            <li>To comply with legal obligations</li>
            <li>With trusted service providers who assist in our operations</li>
            <li>To protect our rights, property, or safety</li>
          </ul>
        </section>

        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ color: '#1e293b', fontSize: '1.5rem', marginBottom: '1rem' }}>5. Data Security</h2>
          <p>
            We implement appropriate technical and organizational security measures to protect your information against unauthorized access, alteration, disclosure, or destruction. This includes encryption, secure servers, and regular security audits.
          </p>
        </section>

        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ color: '#1e293b', fontSize: '1.5rem', marginBottom: '1rem' }}>6. Data Retention</h2>
          <p>
            We retain your information only as long as necessary to provide our services and comply with legal obligations. Customer conversation data is typically retained for business purposes and may be deleted upon request.
          </p>
        </section>

        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ color: '#1e293b', fontSize: '1.5rem', marginBottom: '1rem' }}>7. Your Rights</h2>
          <p>Depending on your jurisdiction, you may have the right to:</p>
          <ul style={{ marginLeft: '1.5rem' }}>
            <li>Access your personal information</li>
            <li>Correct inaccurate information</li>
            <li>Delete your information</li>
            <li>Restrict processing of your information</li>
            <li>Data portability</li>
            <li>Object to processing</li>
          </ul>
        </section>

        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ color: '#1e293b', fontSize: '1.5rem', marginBottom: '1rem' }}>8. WhatsApp Integration</h2>
          <p>
            Our platform integrates with WhatsApp Business API. By using our services, you acknowledge that your data may be processed by WhatsApp according to their terms and privacy policy. We are not responsible for WhatsApp's data practices.
          </p>
        </section>

        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ color: '#1e293b', fontSize: '1.5rem', marginBottom: '1rem' }}>9. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last updated" date.
          </p>
        </section>

        <section style={{ marginBottom: '2rem' }}>
          <h2 style={{ color: '#1e293b', fontSize: '1.5rem', marginBottom: '1rem' }}>10. Contact Us</h2>
          <p>
            If you have any questions about this Privacy Policy or our data practices, please contact us at:
          </p>
          <div style={{ 
            background: '#f8fafc',
            padding: '1rem',
            borderRadius: '8px',
            marginTop: '1rem'
          }}>
            <p><strong>Email:</strong> privacy@chatlogix.in</p>
            <p><strong>Website:</strong> https://chatlogix.in</p>
          </div>
        </section>
      </div>
    </div>
  )
}
