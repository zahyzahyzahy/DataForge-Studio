# DataForge Studio

DataForge Studio is a comprehensive Next.js web application designed to streamline data processing workflows, particularly for CSV and JSON files. It offers a suite of tools for conversion, transformation, validation, and editing of datasets, enhanced with AI-powered insights.

## Key Features:

### 1. File Handling & Conversion:
- **Upload Multiple Files:** Supports uploading of multiple CSV and JSON files simultaneously.
- **CSV to JSON Conversion:** Automatically parses CSV files into JSON format.
- **JSON Merging:** Merges data from multiple uploaded files (both CSV-originated and JSON) into a single dataset.

### 2. Intelligent Data Transformations:
- **DMS to Decimal Degrees (DD) Conversion:**
    - Automatically converts Latitude and Longitude values from various Degrees Minutes Seconds (DMS) formats (e.g., `4°00'51.53"N`, `4:26:17.74208N`) to numeric decimal degrees.
    - Handles values that are already numeric.
- **UTM to Lat/Lon Conversion:**
    - For rows missing Latitude/Longitude but containing valid UTM Easting/Northing values, the application can calculate and fill in the WGS84 coordinates.
    - **Manual UTM Input:** Prompts users to provide UTM zone information (either by selecting from a common list or entering a custom Proj4 string) if it's missing for a row with Easting/Northing.
    - **Manual Coordinate Input:** Allows users to enter Easting and Northing values if they are missing for a row that requires UTM to Lat/Lon conversion.
    - **Bulk UTM Zone Application:** Users can apply a single UTM zone (selected from a list or custom Proj4 string) to all applicable rows within a specific uploaded file, streamlining the process for files where the zone is consistent but missing.
- **URL Standardization by Island:**
    - Identifies unique "Island" names across the dataset.
    - If a URL is missing for an entry but another entry with the same "Island" name has a URL, it standardizes by filling the missing URL with the first valid one found for that island.
    - **Manual URL Input:** If an island is encountered that has no associated URL across any row, the user is prompted to provide a URL for that island, which will then be applied.

### 3. Data Structure Editing & Output Control:
- **Field Renaming:** Allows users to rename column headers (fields) from the original CSV/JSON for the final output.
- **Field Reordering:** Users can change the order of fields in the output JSON objects.
- **Field Inclusion/Exclusion:** Provides checkboxes to include or exclude specific fields from the final JSON output.
- **Row Deselection:** Users can deselect specific rows (e.g., those with unresolvable errors or requiring manual input they choose not to provide) to exclude them from the final downloaded JSON.
- **Editable PSM Numbers in Output:** In the final output preview table, users can directly edit the values of the primary identifier column (e.g., "PSM Station Number") before downloading the JSON.

### 4. Validation, Logging & Issue Management:
- **Transformation Log:**
    - Displays a detailed log of all transformations applied, comparing original and transformed values.
    - Clearly indicates the status of each transformation (e.g., Transformed, Filled, Unchanged, Error, NeedsManualUTMInput, NeedsENAndUTMInput, PendingUTMInput).
- **Issue Identification & Resolution:**
    - A dedicated "Issues & Inputs" tab highlights rows that require user attention.
    - This includes rows with DMS conversion errors, rows needing UTM zone input, rows needing Easting/Northing and UTM zone input, and islands requiring URL input.
    - Provides direct actions from the log to open modals for providing missing UTM/coordinate data or island URLs.
- **Error Reporting:** Clearly flags errors encountered during transformations (e.g., failed DMS to DD conversion).
- **Row Identifier:** Associates errors and log entries with a row identifier (PSM Number if available, otherwise a generated row number like "FileName - Row X").

### 5. AI-Powered Insights (via Genkit):
- **Transformation Suggestions:** Analyzes CSV column headers and suggests potentially useful data transformations.
- **Column Descriptions:** Generates descriptions for each column in the dataset, explaining data type, potential range, and meaning.

### 6. User Interface & Experience:
- **Tabbed Interface:** Organizes functionalities into logical tabs: Upload, Issues & Inputs, Validation, Structure, and Output.
- **Interactive Previews:**
    - Shows a preview of the final JSON data (first 10 records as raw JSON, full data in an editable table).
- **Progress Indicators:** Displays progress during file uploads and processing.
- **Toast Notifications:** Provides feedback on actions like file processing, downloads, and errors.
- **Responsive Design:** Adapts to different screen sizes.

### 7. Download:
- **Download Processed JSON:** Allows users to download the final, transformed, and restructured data as a single JSON file.

## Technology Stack:
- **Frontend:** Next.js (App Router), React, TypeScript, Tailwind CSS, ShadCN UI components
- **AI Integration:** Genkit (for LLM interactions)
- **CSV Parsing:** Papaparse
- **Coordinate Projection:** Proj4js

## Getting Started:

To run DataForge Studio locally:

1.  **Clone the repository.**
2.  **Install dependencies:**
    ```bash
    npm install
    # or
    yarn install
    ```
3.  **Set up environment variables:**
    Create a `.env` file in the root directory. You may need to add API keys for GenAI services if you intend to use the AI features with specific providers.
    ```
    # Example for Google AI Studio (Gemini)
    GOOGLE_API_KEY=YOUR_GOOGLE_API_KEY
    ```
4.  **Run the development server for Next.js:**
    ```bash
    npm run dev
    # or
    yarn dev
    ```
    This will typically start the application on `http://localhost:9002`.

5.  **Run the Genkit development server (in a separate terminal):**
    To enable AI features, you need to run the Genkit development server.
    ```bash
    npm run genkit:dev
    # or
    yarn genkit:dev
    ```
    This will start the Genkit flow server, usually on port 3400. The Next.js app will communicate with this server for AI tasks.

Now you can open your browser and navigate to the application URL to start using DataForge Studio.
