package com.wallt.nativeplugin;

import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioTrack;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

@CapacitorPlugin(name = "WalltNative")
public class WalltNativePlugin extends Plugin {
    private static final int SAMPLE_RATE = 44_100;
    private static final int MAX_NOTE_COUNT = 8;
    private static final AtomicBoolean IS_PLAYING = new AtomicBoolean(false);

    @PluginMethod
    public void playStartupSound(PluginCall call) {
        List<StartupNote> notes;
        try {
            notes = readNotes(call.getArray("notes"));
        } catch (JSONException | IllegalArgumentException error) {
            call.reject("Le note del suono non sono valide.", "INVALID_SOUND", error);
            return;
        }

        if (notes.isEmpty() || notes.size() > MAX_NOTE_COUNT) {
            call.reject("Le note del suono non sono valide.", "INVALID_SOUND");
            return;
        }

        Double requestedVolume = call.getDouble("masterVolume");
        double masterVolume = requestedVolume == null ? 0.2 : requestedVolume;
        if (!Double.isFinite(masterVolume)) {
            call.reject("Il volume del suono non è valido.", "INVALID_SOUND");
            return;
        }
        masterVolume = Math.max(0, Math.min(1, masterVolume));

        if (!IS_PLAYING.compareAndSet(false, true)) {
            call.resolve(new JSObject().put("started", false));
            return;
        }

        final double volume = masterVolume;
        Thread playbackThread = new Thread(() -> play(notes, volume, call), "wallt-startup-audio");
        playbackThread.setDaemon(true);
        playbackThread.start();
    }

    private static List<StartupNote> readNotes(JSArray values) throws JSONException {
        if (values == null || values.length() == 0 || values.length() > MAX_NOTE_COUNT) {
            throw new IllegalArgumentException("Le note del suono non sono valide.");
        }

        List<StartupNote> notes = new ArrayList<>(values.length());
        for (int index = 0; index < values.length(); index += 1) {
            JSONObject value = values.getJSONObject(index);
            double frequency = value.getDouble("frequency");
            double startMs = value.getDouble("startMs");
            double durationMs = value.getDouble("durationMs");
            double volume = value.getDouble("volume");

            if (!Double.isFinite(frequency) || frequency < 50 || frequency > 5_000
                    || !Double.isFinite(startMs) || startMs < 0 || startMs > 3_000
                    || !Double.isFinite(durationMs) || durationMs < 20 || durationMs > 5_000
                    || !Double.isFinite(volume) || volume < 0 || volume > 1) {
                throw new IllegalArgumentException("Le note del suono non sono valide.");
            }

            notes.add(new StartupNote(frequency, startMs, durationMs, volume));
        }
        return notes;
    }

    private static void play(List<StartupNote> notes, double masterVolume, PluginCall call) {
        AudioTrack track = null;
        try {
            short[] samples = createSamples(notes, masterVolume);
            int minimumBufferSize = AudioTrack.getMinBufferSize(
                    SAMPLE_RATE,
                    AudioFormat.CHANNEL_OUT_MONO,
                    AudioFormat.ENCODING_PCM_16BIT
            );
            if (minimumBufferSize <= 0) {
                throw new IllegalStateException("Il dispositivo non supporta il formato audio richiesto.");
            }

            AudioFormat format = new AudioFormat.Builder()
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setSampleRate(SAMPLE_RATE)
                    .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                    .build();
            AudioAttributes attributes = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build();
            int bufferSize = Math.max(minimumBufferSize, samples.length * Short.BYTES);
            track = new AudioTrack.Builder()
                    .setAudioAttributes(attributes)
                    .setAudioFormat(format)
                    .setBufferSizeInBytes(bufferSize)
                    .setTransferMode(AudioTrack.MODE_STREAM)
                    .build();
            if (track.getState() != AudioTrack.STATE_INITIALIZED) {
                throw new IllegalStateException("Il dispositivo non ha inizializzato l’audio.");
            }

            int offset = 0;
            while (offset < samples.length) {
                int written = track.write(samples, offset, samples.length - offset, AudioTrack.WRITE_BLOCKING);
                if (written <= 0) {
                    throw new IllegalStateException("Il dispositivo non ha accettato i campioni audio.");
                }
                offset += written;
            }

            track.play();
            call.resolve(new JSObject().put("started", true));

            while (track.getPlaybackHeadPosition() < samples.length && track.getPlayState() == AudioTrack.PLAYSTATE_PLAYING) {
                Thread.sleep(20);
            }
        } catch (Exception error) {
            call.reject("Non è stato possibile avviare il suono della splash.", "AUDIO_UNAVAILABLE", error);
        } finally {
            if (track != null) {
                if (track.getPlayState() == AudioTrack.PLAYSTATE_PLAYING) {
                    track.stop();
                }
                track.release();
            }
            IS_PLAYING.set(false);
        }
    }

    private static short[] createSamples(List<StartupNote> notes, double masterVolume) {
        double durationMs = notes.stream()
                .mapToDouble(note -> note.startMs + note.durationMs)
                .max()
                .orElse(0);
        int frameCount = (int) Math.ceil(durationMs * SAMPLE_RATE / 1_000);
        short[] samples = new short[frameCount];

        for (int frame = 0; frame < frameCount; frame += 1) {
            double timeMs = frame * 1_000.0 / SAMPLE_RATE;
            double sample = 0;

            for (StartupNote note : notes) {
                double localMs = timeMs - note.startMs;
                if (localMs < 0 || localMs > note.durationMs) continue;

                double attack = Math.min(55, note.durationMs * 0.25);
                double release = Math.min(160, note.durationMs * 0.4);
                double attackGain = attack > 0 ? Math.min(localMs / attack, 1) : 1;
                double releaseGain = release > 0 ? Math.min((note.durationMs - localMs) / release, 1) : 1;
                double envelope = Math.max(0, Math.min(attackGain, releaseGain));
                double phase = 2 * Math.PI * note.frequency * localMs / 1_000;
                sample += Math.sin(phase) * note.volume * masterVolume * envelope;
            }

            double boundedSample = Math.max(-1, Math.min(1, sample));
            samples[frame] = (short) Math.round(boundedSample * Short.MAX_VALUE);
        }

        return samples;
    }

    private static final class StartupNote {
        private final double frequency;
        private final double startMs;
        private final double durationMs;
        private final double volume;

        private StartupNote(double frequency, double startMs, double durationMs, double volume) {
            this.frequency = frequency;
            this.startMs = startMs;
            this.durationMs = durationMs;
            this.volume = volume;
        }
    }
}
