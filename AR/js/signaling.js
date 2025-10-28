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
  }

  window.FirebaseSignaling = FirebaseSignaling
})()


