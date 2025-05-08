# **App Name**: DataForge Studio

## Core Features:

- CSV to JSON Conversion: Upload one or more CSV files and convert them into JSON format.
- JSON Merge: Merge multiple JSON files into a single JSON output.
- JSON Structure Editor: Reorder, include, or exclude fields in the converted JSON output through a drag-and-drop interface.
- Intelligent Data Transformation: Automatically detect and apply appropriate data transformations such as DMS to DD coordinate conversion, UTM to Lat/Lon conversion using the provided python tool when specific columns (Lat, Long, Easting/m, Northing/m, Island, URL) are present in the CSV file. The tool will normalize URLs by island.

## Style Guidelines:

- Primary color: A clean white or light gray (#F5F5F5) to provide a neutral background for data presentation.
- Secondary color: A calming blue (#3498DB) for headers and primary actions.
- Accent: A vibrant green (#2ECC71) to indicate successful conversions and actions.
- Use a single-page layout with clear sections for uploading, editing, and output display.
- Utilize clear and simple icons from a library like FontAwesome or Material Icons to represent actions like upload, download, edit, and merge.
- Use subtle transitions and animations to provide feedback on actions, like a progress bar during conversion or a highlight on successfully merged JSON objects.