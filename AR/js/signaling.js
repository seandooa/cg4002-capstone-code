;(function(){
  class FirebaseSignaling {
    constructor(appName = 'ar-fitness') {
      this.app = null
      this.db = null
      this.roomDoc = null
      this.callerCandidates = null
      this.calleeCandidates = null
      this.roomId = null
      this.role = null // 'caller' | 'callee'
    }

    async initialize() {
      const config = window.FIREBASE_CONFIG
      if (!config) throw new Error('FIREBASE_CONFIG missing. Copy js/config.example.js to js/config.js and fill it.')

      // Lazy load Firebase SDKs from CDN
      if (!window.firebase) {
        await this._loadScript('https://www.gstatic.com/firebasejs/10.12.4/firebase-app-compat.js')
        await this._loadScript('https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore-compat.js')
      }

      this.app = window.firebase.initializeApp(config)
      this.db = window.firebase.firestore()
    }

    async createRoom(offer) {
      this.role = 'caller'
      const serializedOffer = { type: offer.type, sdp: offer.sdp }
      this.roomDoc = await this.db.collection('webrtcRooms').add({ offer: serializedOffer, createdAt: Date.now() })
      this.callerCandidates = this.roomDoc.collection('callerCandidates')
      this.calleeCandidates = this.roomDoc.collection('calleeCandidates')
      this.roomId = this.roomDoc.id
      return this.roomId
    }

    async setAnswer(answer) {
      const serializedAnswer = { type: answer.type, sdp: answer.sdp }
      await this.roomDoc.update({ answer: serializedAnswer, answeredAt: Date.now() })
    }

    async joinRoom(roomId, answer) {
      this.role = 'callee'
      this.roomDoc = await this.db.collection('webrtcRooms').doc(roomId)
      const roomSnapshot = await this.roomDoc.get()
      if (!roomSnapshot.exists) throw new Error('Room does not exist')
      this.callerCandidates = this.roomDoc.collection('callerCandidates')
      this.calleeCandidates = this.roomDoc.collection('calleeCandidates')
      const serializedAnswer = { type: answer.type, sdp: answer.sdp }
      await this.roomDoc.update({ answer: serializedAnswer, joinedAt: Date.now() })
      this.roomId = roomId
    }

    onOffer(callback) {
      if (!this.roomDoc) throw new Error('Room not set')
      return this.roomDoc.onSnapshot(async (snapshot) => {
        const data = snapshot.data()
        if (data && data.offer) callback(new RTCSessionDescription(data.offer))
      })
    }

    onAnswer(callback) {
      if (!this.roomDoc) throw new Error('Room not set')
      return this.roomDoc.onSnapshot(async (snapshot) => {
        const data = snapshot.data()
        if (data && data.answer) callback(new RTCSessionDescription(data.answer))
      })
    }

    onCallerIce(callback) {
      if (!this.callerCandidates) throw new Error('Caller candidates not set')
      return this.callerCandidates.onSnapshot((snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const data = change.doc.data()
            callback(new RTCIceCandidate(data))
          }
        })
      })
    }

    onCalleeIce(callback) {
      if (!this.calleeCandidates) throw new Error('Callee candidates not set')
      return this.calleeCandidates.onSnapshot((snapshot) => {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const data = change.doc.data()
            callback(new RTCIceCandidate(data))
          }
        })
      })
    }

    async addCallerIce(candidate) {
      if (!this.callerCandidates) throw new Error('Caller candidates not set')
      const serialized = { candidate: candidate.candidate, sdpMid: candidate.sdpMid, sdpMLineIndex: candidate.sdpMLineIndex }
      await this.callerCandidates.add(serialized)
    }

    async addCalleeIce(candidate) {
      if (!this.calleeCandidates) throw new Error('Callee candidates not set')
      const serialized = { candidate: candidate.candidate, sdpMid: candidate.sdpMid, sdpMLineIndex: candidate.sdpMLineIndex }
      await this.calleeCandidates.add(serialized)
    }

    async _loadScript(src) {
      return new Promise((resolve, reject) => {
        const s = document.createElement('script')
        s.src = src
        s.onload = resolve
        s.onerror = reject
        document.head.appendChild(s)
      })
    }

    // Fetch recent room IDs (most recent 3)
    async getRecentRooms(limit = 3) {
      if (!this.db) throw new Error('Firebase not initialized')
      
      try {
        // Get all rooms and filter/sort by createdAt
        const snapshot = await this.db.collection('webrtcRooms').get()
        
        const rooms = []
        snapshot.forEach(doc => {
          const data = doc.data()
          // Only include rooms with createdAt timestamp
          if (data.createdAt) {
            rooms.push({
              id: doc.id,
              createdAt: data.createdAt,
              createdAtFormatted: new Date(data.createdAt).toLocaleString()
            })
          }
        })
        
        // Sort by createdAt (most recent first) and limit
        rooms.sort((a, b) => b.createdAt - a.createdAt)
        return rooms.slice(0, limit)
      } catch (error) {
        console.error('Error fetching recent rooms:', error)
        return []
      }
    }

    // Delete a room by ID
    async deleteRoom(roomId) {
      if (!this.db) throw new Error('Firebase not initialized')
      
      try {
        const roomRef = this.db.collection('webrtcRooms').doc(roomId)
        
        // Delete subcollections (callerCandidates and calleeCandidates)
        const callerCandidates = await roomRef.collection('callerCandidates').get()
        const calleeCandidates = await roomRef.collection('calleeCandidates').get()
        
        const deletePromises = []
        
        callerCandidates.forEach(doc => {
          deletePromises.push(doc.ref.delete())
        })
        
        calleeCandidates.forEach(doc => {
          deletePromises.push(doc.ref.delete())
        })
        
        await Promise.all(deletePromises)
        
        // Delete the room document
        await roomRef.delete()
        
        console.log(`Room ${roomId} deleted successfully`)
        return true
      } catch (error) {
        console.error('Error deleting room:', error)
        throw error
      }
    }

    // Clean up rooms older than specified hours (default 24 hours)
    async cleanupOldRooms(maxAgeHours = 24) {
      if (!this.db) throw new Error('Firebase not initialized')
      
      try {
        const cutoffTime = Date.now() - (maxAgeHours * 60 * 60 * 1000)
        
        // Get all rooms and filter by createdAt (handles rooms without createdAt by deleting them too)
        const snapshot = await this.db.collection('webrtcRooms').get()
        
        const deletePromises = []
        
        snapshot.forEach((doc) => {
          const data = doc.data()
          const createdAt = data.createdAt || 0
          const roomId = doc.id
          
          // Delete if room is older than cutoff OR if createdAt doesn't exist (legacy rooms)
          if (createdAt < cutoffTime || !data.createdAt) {
            deletePromises.push(
              this.deleteRoom(roomId).catch(error => {
                console.error(`Failed to delete room ${roomId}:`, error)
                return false
              })
            )
          }
        })
        
        const results = await Promise.all(deletePromises)
        const deletedCount = results.filter(r => r === true).length
        
        if (deletedCount > 0) {
          console.log(`Cleaned up ${deletedCount} old room(s)`)
        }
        return deletedCount
      } catch (error) {
        console.error('Error cleaning up old rooms:', error)
        return 0
      }
    }
  }

  window.FirebaseSignaling = FirebaseSignaling
})()


