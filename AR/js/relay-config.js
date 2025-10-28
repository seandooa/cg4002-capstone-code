// Relay Node Configuration
// This file contains configuration options for connecting to external relay nodes

class RelayNodeConfig {
  constructor() {
    this.defaultConfig = {
      enabled: false,
      url: '',  // Will be auto-detected based on local IP
      reconnectInterval: 5000,
      maxReconnectAttempts: 10,
      dataTransmissionInterval: 100, // ms between pose data transmissions
      enableBiometricData: true,
      enablePoseData: true,
      enableRepDetection: true,
      enableVideoFrames: false, // Disabled by default due to bandwidth
      compressionEnabled: true,
      encryptionEnabled: false
    }
  }

  // Load configuration from localStorage or use defaults
  loadConfig() {
    const config = { ...this.defaultConfig }
    
    // Load from localStorage if available
    const storedConfig = localStorage.getItem('relayNodeConfig')
    if (storedConfig) {
      try {
        const parsed = JSON.parse(storedConfig)
        // Use stored config
        Object.assign(config, parsed)
      } catch (error) {
        console.warn('Failed to parse stored relay config, using defaults:', error)
      }
    }
    
    return config
  }

  // Save configuration to localStorage
  saveConfig(config) {
    try {
      localStorage.setItem('relayNodeConfig', JSON.stringify(config))
      console.log('Relay node configuration saved')
    } catch (error) {
      console.error('Failed to save relay node configuration:', error)
    }
  }

  // Update specific configuration values
  updateConfig(updates) {
    const currentConfig = this.loadConfig()
    const newConfig = { ...currentConfig, ...updates }
    this.saveConfig(newConfig)
    return newConfig
  }

  // Reset to default configuration
  resetConfig() {
    this.saveConfig(this.defaultConfig)
    return this.defaultConfig
  }

  // Force clear old configuration and use new defaults
  forceResetConfig() {
    // Clear any old relay configuration
    localStorage.removeItem('relayNodeConfig')
    localStorage.removeItem('relayNodeUrl')
    localStorage.removeItem('relayNodeEnabled')
    localStorage.removeItem('relayNodeReconnectInterval')
    localStorage.removeItem('relayNodeMaxReconnectAttempts')
    
    // Save the new default configuration
    this.saveConfig(this.defaultConfig)
    console.log('Relay configuration reset to new defaults')
    return this.defaultConfig
  }

  // Validate configuration
  validateConfig(config) {
    const errors = []
    
    if (config.url && !this.isValidWebSocketUrl(config.url)) {
      errors.push('Invalid WebSocket URL format')
    }
    
    if (config.reconnectInterval < 1000) {
      errors.push('Reconnect interval must be at least 1000ms')
    }
    
    if (config.maxReconnectAttempts < 0) {
      errors.push('Max reconnect attempts must be non-negative')
    }
    
    if (config.dataTransmissionInterval < 50) {
      errors.push('Data transmission interval must be at least 50ms')
    }
    
    return {
      isValid: errors.length === 0,
      errors: errors
    }
  }

  // Check if URL is a valid WebSocket URL
  isValidWebSocketUrl(url) {
    try {
      const urlObj = new URL(url)
      return urlObj.protocol === 'ws:' || urlObj.protocol === 'wss:'
    } catch {
      return false
    }
  }

  // Get connection status display text
  getConnectionStatusText(isConnected, reconnectAttempts, maxAttempts) {
    if (isConnected) {
      return 'Connected to Relay Node'
    } else if (reconnectAttempts > 0) {
      return `Reconnecting... (${reconnectAttempts}/${maxAttempts})`
    } else {
      return 'Disconnected from Relay Node'
    }
  }

  // Get connection status CSS class
  getConnectionStatusClass(isConnected, reconnectAttempts) {
    if (isConnected) {
      return 'relay-status-connected'
    } else if (reconnectAttempts > 0) {
      return 'relay-status-reconnecting'
    } else {
      return 'relay-status-disconnected'
    }
  }
}

// Make globally available
window.RelayNodeConfig = RelayNodeConfig

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = RelayNodeConfig
}
