"""Ayudante del mod modo-voz.

  python voz.py escuchar [--espera 12]   -> graba el micro hasta que dejas de hablar,
                                            transcribe en español y escribe {"text": ...}
  python voz.py hablar  < texto          -> lee el texto en voz alta (voz nova de OpenAI)
  python voz.py micros                    -> lista los micrófonos que ve ffmpeg

La clave OPENAI_API_KEY se lee del .env global (~/.claude/.env); nunca se guarda aquí.
Micrófono: el de la variable VOZ_MIC (trozo del nombre) o, si no, Focusrite, el del
portátil o el primero que haya.
"""

import array
import glob
import io
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
import wave

FRAME_MS = 100
RATE = 16000
FRAME_BYTES = RATE * FRAME_MS // 1000 * 2  # mono, 16 bits


def salir_con(obj, code=0):
    sys.stdout.write(json.dumps(obj, ensure_ascii=False))
    sys.stdout.flush()
    sys.exit(code)


def cargar_env():
    ruta = os.path.join(os.path.expanduser("~"), ".claude", ".env")
    try:
        from dotenv import load_dotenv

        load_dotenv(ruta)
        return
    except ImportError:
        pass
    if os.path.exists(ruta):
        with open(ruta, encoding="utf-8") as f:
            for linea in f:
                m = re.match(r"\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$", linea)
                if m and m.group(1) not in os.environ:
                    os.environ[m.group(1)] = m.group(2).strip().strip('"').strip("'")


def binario(nombre):
    encontrado = shutil.which(nombre)
    if encontrado:
        return encontrado
    patron = os.path.join(
        os.environ.get("LOCALAPPDATA", ""),
        "Microsoft",
        "WinGet",
        "Packages",
        "Gyan.FFmpeg*",
        "*",
        "bin",
        f"{nombre}.exe",
    )
    candidatos = glob.glob(patron)
    if candidatos:
        return candidatos[0]
    raise RuntimeError(f"No encuentro {nombre} (ffmpeg) en este PC")


def micros():
    salida = subprocess.run(
        [binario("ffmpeg"), "-hide_banner", "-list_devices", "true", "-f", "dshow", "-i", "dummy"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    ).stderr.splitlines()
    lista = []
    for i, linea in enumerate(salida):
        m = re.search(r'"(.+)" \(audio\)', linea)
        if m:
            alt = None
            if i + 1 < len(salida):
                a = re.search(r'Alternative name "(.+)"', salida[i + 1])
                alt = a.group(1) if a else None
            lista.append({"nombre": m.group(1), "id": alt or m.group(1)})
    return lista


def elegir_micro():
    lista = micros()
    if not lista:
        raise RuntimeError("No hay ningún micrófono disponible")
    preferido = os.environ.get("VOZ_MIC", "").lower()
    for clave in [preferido, "focusrite", "micr"]:
        if clave:
            for m in lista:
                if clave in m["nombre"].lower():
                    return m
    return lista[0]


def db(frame):
    muestras = array.array("h", frame)
    if not muestras:
        return -100.0
    rms = math.sqrt(sum(s * s for s in muestras) / len(muestras))
    return 20 * math.log10(rms / 32768) if rms > 0 else -100.0


def pitido(freq, ms):
    try:
        import winsound

        winsound.Beep(freq, ms)
    except Exception:
        pass


def grabar(espera_s):
    micro = elegir_micro()
    pitido(990, 130)
    proc = subprocess.Popen(
        [
            binario("ffmpeg"),
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "dshow",
            "-audio_buffer_size",
            "50",
            "-i",
            f"audio={micro['id']}",
            "-ac",
            "1",
            "-ar",
            str(RATE),
            "-f",
            "s16le",
            "-",
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    frames = []
    niveles = []
    try:
        # 0,6 s para medir el ruido de la sala (lo primero que da el micro al
        # arrancar es silencio digital, que no cuenta).
        leidos = 0
        for _ in range(6):
            f = proc.stdout.read(FRAME_BYTES)
            if not f:
                break
            leidos += 1
            nivel = db(f)
            if nivel > -90:
                niveles.append(nivel)
        if not leidos:
            err = proc.stderr.read().decode("utf-8", "replace")
            raise RuntimeError(f"El micrófono no da audio: {err.strip()[:300]}")
        # El tramo más silencioso es el ruido de la sala; el umbral nunca pasa de
        # -33 dB, para que una voz normal lo supere aunque ya estuvieras hablando.
        suelo = min(niveles) if niveles else -60.0
        umbral = min(max(suelo + 7, -50.0), -33.0)

        previos = []
        empezado = False
        voz_seguida = 0
        silencio = 0
        total = 0
        max_espera = int(espera_s * 1000 / FRAME_MS)
        max_habla = int(60 * 1000 / FRAME_MS)
        pico = -100.0
        while True:
            f = proc.stdout.read(FRAME_BYTES)
            if not f or len(f) < FRAME_BYTES:
                break
            nivel = db(f)
            pico = max(pico, nivel)
            total += 1
            if not empezado:
                previos = (previos + [f])[-4:]
                voz_seguida = voz_seguida + 1 if nivel > umbral else 0
                if voz_seguida >= 2:
                    empezado = True
                    frames.extend(previos)
                    total = 0
                elif total >= max_espera:
                    break
            else:
                frames.append(f)
                silencio = silencio + 1 if nivel < umbral - 2 else 0
                if silencio >= 15 or total >= max_habla:
                    break
    finally:
        proc.kill()
        proc.wait()
    if frames:
        pitido(660, 90)
    return b"".join(frames), {"micro": micro["nombre"], "suelo_db": round(suelo, 1), "umbral_db": round(umbral, 1), "pico_db": round(pico, 1)}


def transcribir(pcm):
    cargar_env()
    from openai import OpenAI

    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(pcm)
    buf.seek(0)
    buf.name = "voz.wav"
    client = OpenAI()
    try:
        r = client.audio.transcriptions.create(model="gpt-4o-transcribe", file=buf, language="es")
    except Exception:
        buf.seek(0)
        r = client.audio.transcriptions.create(model="whisper-1", file=buf, language="es")
    return (r.text or "").strip()


def escuchar(espera_s):
    pcm, info = grabar(espera_s)
    if len(pcm) < FRAME_BYTES * 4:
        salir_con({"text": "", **info})
    salir_con({"text": transcribir(pcm), **info})


def hablar(texto):
    texto = texto.strip()
    if not texto:
        salir_con({"ok": True})
    cargar_env()
    from openai import OpenAI

    client = OpenAI()
    audio = client.audio.speech.create(
        model="gpt-4o-mini-tts",
        voice="nova",
        input=texto[:3500],
        instructions="Habla en español de España, con tono natural, cercano y ágil.",
        response_format="mp3",
    )
    fd, ruta = tempfile.mkstemp(suffix=".mp3", prefix="modo-voz-")
    os.close(fd)
    try:
        with open(ruta, "wb") as f:
            f.write(audio.content)
        subprocess.run(
            [binario("ffplay"), "-nodisp", "-autoexit", "-loglevel", "quiet", ruta],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    finally:
        try:
            os.unlink(ruta)  # temporal propio del script
        except OSError:
            pass
    salir_con({"ok": True})


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stdin, "reconfigure"):
        sys.stdin.reconfigure(encoding="utf-8")
    orden = sys.argv[1] if len(sys.argv) > 1 else ""
    try:
        if orden == "escuchar":
            espera = 12.0
            if "--espera" in sys.argv:
                espera = float(sys.argv[sys.argv.index("--espera") + 1])
            escuchar(espera)
        elif orden == "hablar":
            hablar(sys.stdin.read())
        elif orden == "micros":
            salir_con({"micros": micros()})
        else:
            salir_con({"error": "uso: voz.py escuchar|hablar|micros"}, 2)
    except SystemExit:
        raise
    except Exception as err:  # el mod muestra este texto en un aviso
        salir_con({"error": str(err)[:500]}, 1)


if __name__ == "__main__":
    main()
