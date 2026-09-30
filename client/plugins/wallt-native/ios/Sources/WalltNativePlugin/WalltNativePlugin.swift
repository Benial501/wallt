import AVFoundation
import Capacitor

private struct StartupSoundNote {
    let frequency: Double
    let startMs: Double
    let durationMs: Double
    let volume: Double
}

@objc(WalltNativePlugin)
public class WalltNativePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WalltNativePlugin"
    public let jsName = "WalltNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "playStartupSound", returnType: CAPPluginReturnPromise)
    ]

    private let audioQueue = DispatchQueue(label: "com.wallt.native.startup-audio")
    private var audioEngine: AVAudioEngine?
    private var audioPlayerNode: AVAudioPlayerNode?

    @objc func playStartupSound(_ call: CAPPluginCall) {
        guard
            let rawNotes = call.getArray("notes") as? [[String: Any]],
            !rawNotes.isEmpty,
            rawNotes.count <= 8
        else {
            call.reject("Le note del suono non sono valide.", "INVALID_SOUND")
            return
        }

        let notes = rawNotes.compactMap(Self.parseNote)
        guard notes.count == rawNotes.count else {
            call.reject("Le note del suono non sono valide.", "INVALID_SOUND")
            return
        }

        let masterVolume = min(max(Double(call.getFloat("masterVolume", 0.2)), 0), 1)
        audioQueue.async { [weak self] in
            guard let self else {
                call.reject("Il motore audio non è disponibile.", "AUDIO_UNAVAILABLE")
                return
            }

            do {
                try self.start(notes: notes, masterVolume: masterVolume)
                call.resolve(["started": true])
            } catch {
                self.stopCurrentAudio()
                try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
                call.reject("Non è stato possibile avviare il suono della splash.", "AUDIO_UNAVAILABLE", error)
            }
        }
    }

    private static func parseNote(_ value: [String: Any]) -> StartupSoundNote? {
        guard
            let frequency = (value["frequency"] as? NSNumber)?.doubleValue,
            let startMs = (value["startMs"] as? NSNumber)?.doubleValue,
            let durationMs = (value["durationMs"] as? NSNumber)?.doubleValue,
            let volume = (value["volume"] as? NSNumber)?.doubleValue,
            (50...5_000).contains(frequency),
            (0...3_000).contains(startMs),
            (20...5_000).contains(durationMs),
            (0...1).contains(volume)
        else {
            return nil
        }

        return StartupSoundNote(
            frequency: frequency,
            startMs: startMs,
            durationMs: durationMs,
            volume: volume
        )
    }

    private func start(notes: [StartupSoundNote], masterVolume: Double) throws {
        stopCurrentAudio()

        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.ambient, mode: .default, options: [.mixWithOthers])
        try session.setActive(true)

        let buffer = try makeBuffer(notes: notes, masterVolume: masterVolume)
        let engine = AVAudioEngine()
        let player = AVAudioPlayerNode()
        engine.attach(player)
        engine.connect(player, to: engine.mainMixerNode, format: buffer.format)
        player.scheduleBuffer(buffer) { [weak self, weak engine, weak player] in
            guard let self, let engine, let player else { return }
            self.audioQueue.async {
                guard self.audioEngine === engine else { return }
                player.stop()
                engine.stop()
                self.audioPlayerNode = nil
                self.audioEngine = nil
                try? AVAudioSession.sharedInstance().setActive(
                    false,
                    options: .notifyOthersOnDeactivation
                )
            }
        }

        audioEngine = engine
        audioPlayerNode = player
        engine.prepare()
        try engine.start()
        player.play()
    }

    private func makeBuffer(notes: [StartupSoundNote], masterVolume: Double) throws -> AVAudioPCMBuffer {
        let sampleRate = 44_100.0
        let format = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: 1)!
        let durationMs = notes.map { $0.startMs + $0.durationMs }.max() ?? 0
        let frameCapacity = AVAudioFrameCount(ceil(durationMs * sampleRate / 1_000))
        guard frameCapacity > 0, let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCapacity) else {
            throw StartupSoundError.invalidBuffer
        }

        buffer.frameLength = frameCapacity
        guard let samples = buffer.floatChannelData?[0] else {
            throw StartupSoundError.invalidBuffer
        }

        for frame in 0..<Int(frameCapacity) {
            let timeMs = Double(frame) * 1_000 / sampleRate
            var sample = 0.0

            for note in notes {
                let localMs = timeMs - note.startMs
                guard localMs >= 0, localMs <= note.durationMs else { continue }

                let attack = min(55.0, note.durationMs * 0.25)
                let release = min(160.0, note.durationMs * 0.4)
                let attackGain = attack > 0 ? min(localMs / attack, 1) : 1
                let releaseGain = release > 0 ? min((note.durationMs - localMs) / release, 1) : 1
                let envelope = max(0, min(attackGain, releaseGain))
                let phase = 2 * Double.pi * note.frequency * localMs / 1_000
                sample += sin(phase) * note.volume * masterVolume * envelope
            }

            samples[frame] = Float(min(max(sample, -1), 1))
        }

        return buffer
    }

    private func stopCurrentAudio() {
        audioPlayerNode?.stop()
        audioEngine?.stop()
        audioPlayerNode = nil
        audioEngine = nil
    }
}

private enum StartupSoundError: Error {
    case invalidBuffer
}
