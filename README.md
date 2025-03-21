# Smart Document Classifier - README

This project implements a web application for classifying uploaded documents (PDFs, DOCX, and TXT) into predefined categories using a novel approach based on sentence embeddings and cosine similarity. The application is built with FastAPI (backend), React with TypeScript (frontend), and Supabase (database and file storage).

## Project Goals and Approach

My primary goal was to build a *functional* document classifier that met the core requirements of the provided technical specification, while exploring a less-common, but potentially very efficient, zero-shot classification method.

I prioritized speed, efficiency, and ease of deployment, even on resource-constrained hardware (CPU-only). Instead of relying on large language models (LLMs) like BART (as suggested in the specification), I decided to *investigate the viability of using sentence embeddings*, specifically `sentence-transformers/all-MiniLM-L6-v2`. I chose this approach for the following reasons:

*   **Novelty:** It's a less common approach, and I was keen to explore the capabilities of sentence embeddings.
*   **Efficiency:** Sentence embedding models are significantly faster, require fewer resources than LLMs, and would run easily on my budget laptop :( .
*   **Curiosity:** I wanted to test the hypothesis that well-crafted category descriptions, combined with sentence embeddings *and effective document chunking*, could achieve reasonable accuracy.

## Technology Stack and Justification

*   **Backend:**
    *   **FastAPI (Python):** A modern, fast web framework. Chosen for speed, automatic data validation (via Pydantic), and API-focused design.
    *   **Pydantic:** For data validation and defining API request/response models.
    *   **Supabase:** Provides PostgreSQL database and file storage. Simplifies deployment.
    *   **Hugging Face Transformers:** Used to load and utilise the pre-trained sentence embedding model. 
    *   **`sentence-transformers/all-MiniLM-L6-v2`:** The core sentence embedding model. *Justified in detail in the "Model Choice" section below.*
    *   **`PyPDF2`, `python-docx`, `textract`, `python-magic`:** Libraries for handling various document formats (PDF, DOCX, TXT) and extracting text. 
    *   **`nltk` and `spaCy`:** For text pre-processing.

*   **Frontend:**
    *   **React (with TypeScript):** Chosen for its component-based architecture and efficiency. 
    *   **`react-dropzone`:** Implements drag-and-drop file upload.
    *   **`fetch`:** For making API requests.
    *   **`react-chartjs-2`:** Used for creating visualisations in the statistics dashboard.

## Architecture

1.  **Frontend (React):** User interface. Communicates with the backend via a RESTful API.
2.  **Backend (FastAPI):** Handles API requests, processing, classification, and database interactions.
3.  **Database & Storage (Supabase):** Stores metadata (PostgreSQL) and uploaded files (Storage).

[Client Browser] <--> [React Frontend] <--> [FastAPI Backend] <--> [Supabase (DB & Storage)]
                                                    ^
                                                    |
                                                    v
                                    [ML Model (Sentence Transformers)]


**Frontend Structure:**

compuJ
├── frontend/
│   ├── public/
│   │   └── index.html                # HTML entry point
│   ├── src/
│   │   ├── components/
│   │   │   ├── FileUpload.tsx        # Document upload component
│   │   │   ├── StatisticalAnalysis.tsx # Document analysis visualization
│   │   │   ├── ErrorMessage.tsx      # Error display component
│   │   │   └── ...
│   │   ├── services/
│   │   │   ├── api.ts                # API communication service
│   │   │   ├── errorService.ts       # Error handling and formatting
│   │   │   └── ...
│   │   ├── App.tsx                   # Main React component
│   │   └── index.tsx                 # React application entry point
│   ├── package.json                  # Frontend dependencies and scripts
│   └── tsconfig.json                 # TypeScript configuration
└── README.md

**Backend Structure:**

compuJ/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── routes/
│   │   │   │   ├── files.py          # Document upload and management endpoints
│   │   │   │   └── ...
│   │   │   └── api.py                # API router configuration
│   │   ├── core/
│   │   │   ├── config.py             # Application configuration settings
│   │   │   ├── exceptions.py         # Custom exception classes
│   │   │   └── middleware.py         # Request/response middleware
│   │   ├── services/
│   │   │   ├── document_processor.py # Document text extraction logic
│   │   │   └── ...
│   │   └── main.py                   # Application entry point
│   ├── tests/                        # Backend tests (limited implementation)
│   └── requirements.txt              # Python dependencies


## Implementation Details and Requirements Met

**1. Document Upload (Core Functionality):**

*   Drag-and-drop uploads (`react-dropzone`).
*   Supports PDF, DOCX, and TXT files.
*   `python-magic` for file type validation.

**2. Document Classification (Core Functionality):**

*   Zero-shot classification via sentence embeddings and cosine similarity.
*   Model: `sentence-transformers/all-MiniLM-L6-v2`.
*   Categories: Technical Documentation, Business Proposal, Legal Document, Academic Paper, General Article, Other.
*   Confidence scores (percentages, shifted from [-1, +1] to [0, 1] for readiability).

**3. Data Preprocessing (ML Pipeline Robustness):**

*   Text extraction from multiple formats.
*   Basic cleaning (lowercasing and whitespace removal).
*   Sentence-based chunking (`spaCy`).

**4. API Design (Core Functionality):**

*   POST /api/v1/files/upload/ - Uploads, validates, processes, and stores       document files with text extraction and classification.
*   POST /api/v1/files/diagnose-pdf/ - Analyzes PDF files to diagnose issues without saving them to storage.
*   GET /api/v1/files/{file_id}/ - Retrieves a specific document by ID with its metadata and content.
*   DELETE /api/v1/files/{file_id}/ - Deletes a document from both storage and database.
*   GET /api/v1/files/ - Lists documents with optional filtering and pagination.
*   GET /health - Simple health check that verifies the API is running correctly.
*   GET / - Root endpoint that provides basic API information and documentation links.
*   GET /api/v1/analysis/documents - Retrieves statistical analysis data for document content.
*   GET /api/v1/analysis/categories - Returns information about document category distributions.

**5. Database (Core Functionality):**

*   Supabase (PostgreSQL) for metadata.
*   Supabase Storage for files.

**6. User Interface (Core Functionality):**

*   React frontend with drag-and-drop upload.
*   Clear display of results.
*   List view of documents.

**7. Statistics Dashboard (Bonus Functionality):**

*   **Visualizations:**
    *   Category distribution (bar chart).
    *   Average confidence per category (line graph).
    *   Confidence score distribution (histogram).
    *   PCA cluster visualization (scatter plot).
    *   Most frequent words per category (word cloud).

**8. Error Handling:**

*   Robust error handling is implemented throughout. Examples include:
    *   **File Size Limits:** If an uploaded document exceeds 10MB, the API returns a 400 Bad Request.
    *   **Duplicate Documents:** If a document with the same content hash is uploaded, the API rejects the upload with a 409 Conflict response.
    *   **Invalid File Types:** If a file is not a valid PDF, DOCX, or TXT, the API returns a 400 Bad Request.
    *   **Database/Download Errors:** Database connection/download errors and other database-related issues are handled, returning 500 Internal Server Error responses.

**9. Model Justification:**

`sentence-transformers/all-MiniLM-L6-v2` was chosen over alternatives like `facebook/bart-large-mnli` for its superior balance of speed, efficiency, and reasonable accuracy, aligning with CPU-only operation.

## Model Performance and Analysis

*   **Tight Confidence Scores:** Most confidence scores are between 50% and 60% showing a limited trend
*   **"Other" Category Underutilized:** No documenets were classified as Other, showing there is a blind spot here most likely because of it's ambigious label description
* **Business Proposal Overlap:** Business Proposal was the most populer label, perhaps showing it's description needs to be less ambigious and more specific
*   **PCA Clustering:** Groupings show some success by using sentence embeddings, this is evidence of potential and a reason to investigate this method further
* **Ground Truth Evaluation:** I assummed ground truths for each documeent so I coul dcompare my accuracy, it is low -evidencing this method's challenges but still above random selection which shows it can still be useful

## Future Improvements for model accuracy

*   **Refine Category Descriptions:** 
         * Improve clarity of descriptions
         * Incorporate frequent words seen in the word clouds
         *Explore definitions based aroud formal languages utilisng LLMs like encoders to encode the label into a formal lanagugae and then decoding it back into a description*.
*   **Experiment with Larger/Different Sentence Transformer Models:** Try other models.
*   **Ensemble Models:** Combine multiple models.
*   **Fine-tuning (Requires Labeled Data):** Consider if labeled data becomes available.
* **Preprocessing**: Experiment with punctuation handling.
* **Add Rate Limiting**

## Testing
Comprehensive unit testing is an area for future improvement.

## Deployment

The application is designed to be deployable locally but could be configure for:

*   **Cloud Platforms:** AWS, GCP, Azure (serverless functions, containers, VMs).
*   **Render:** A simplified platform.
*   **Self-Hosting:** Docker or a traditional VPS setup.
     *(running instructions below)*

## Privacy

*   All document processing occurs locally, within the user's own hosted instance.
*   No user data is collected beyond the document contents.
*   **Supabase Security:** Currently, Row Level Security (RLS) is disabled for ease of development. For a production deployment with authorized users, enabling and configuring RLS is *essential*. Supabase provides straightforward mechanisms for implementing RLS.

## Getting Started

To run the application locally:

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/JacobMcNulty-AI-Solutions/Jacob_compuJ
    ```

2.  **Replace contents of .env.example with those in the email and rename to .env**

3.  **Create a new venv and activate your virtual environment:**
    ```bash
    python -m venv venv
    venv/Scripts/Activate.ps1
    ```

3.5  **OR use the venv in repo and activate (this may require admin privilages but is a lot faster):**
    ```bash
    venv/Scripts/Activate.ps1
    ```

4.  **Navigate to the backend directory, install dependencies, and run API:**
    ```bash
    cd backend
    pip install -r requirements.txt
    python -m spacy download en_core_web_sm
    uvicorn app.main:app
    ```

5.  **Navigate to the frontend directory:**
    ```bash
    cd ../frontend
    npm install
    npm start
    ```

5.5.  **Wait for the backend/frontend to bootup, it may take a minute**

6.  **Access the application in your browser at `http://localhost:3000`.**

## Conclusion

This project provides a functional document classifier, meeting the core requirements and demonstrating my skills as a problem solver and systems engineer. It prioritises a fast, efficient, and novel approach using sentence embeddings. The limitations are acknowledged, and clear paths for future improvement are outlined. The project demonstrates the ability to build a working application within constraints and to make informed technical decisions.