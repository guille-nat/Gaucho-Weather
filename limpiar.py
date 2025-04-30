import os

# Ruta de la carpeta donde se encuentran los archivos
carpeta = r"FrontEnd/public/icons/weather_code"

# Listar archivos en la carpeta
archivos = os.listdir(carpeta)

# Iterar sobre los archivos y eliminar los que terminen con 'small.png'
for archivo in archivos:
    if archivo.endswith("small.png"):
        os.remove(os.path.join(carpeta, archivo))
        print(f"Archivo eliminado: {archivo}")

print("Proceso completado.")
