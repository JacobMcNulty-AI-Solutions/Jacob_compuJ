import numpy as np
import re
import spacy
from typing import Dict, List, Tuple
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
import string
import sklearn
from sklearn.feature_extraction.text import TfidfVectorizer
import nltk
from nltk.corpus import stopwords
from nltk.tokenize import word_tokenize
import os

# Load spaCy model - small English model
nlp = spacy.load("en_core_web_sm")
# Disable unnecessary components for better performance
nlp.disable_pipes(["ner", "attribute_ruler", "lemmatizer"])

# Ensure NLTK data is downloaded
try:
    nltk.data.find('corpora/stopwords')
    nltk.data.find('tokenizers/punkt')
except LookupError:
    nltk.download('stopwords')
    nltk.download('punkt')

class DocumentClassifier:
    """
    Zero-shot document classifier using sentence-transformers.
    """
    def __init__(self):
        # Define document categories with revised descriptive prompts
        self.categories = {
  "Technical Documentation": "This document delineates precise technical specifications, operational procedures, and implementation guidelines pertaining to a specific technology, engineered system, hardware component, or software application. It incorporates schematics, technical diagrams, code samples, and configuration parameters, serving as a definitive reference for technical personnel. It is explicitly *not* a promotional document, financial report, or general audience explanation; it is intended for skilled practitioners requiring detailed technical knowledge.",
  "Business Proposal": "This document formally presents a commercial proposition, outlining a tailored solution to address a prospective client's explicitly identified business needs or strategic opportunities. It articulates a compelling value proposition, defines a precise scope of work, details a pricing structure, and forecasts quantifiable return on investment (ROI) or other key performance indicators (KPIs). This is definitively *not* a technical specification document, academic treatise, or legal contract; it is a persuasive instrument designed to secure a business agreement and commitment.",
  "Legal Document": "This document establishes legally binding and enforceable terms, conditions, rights, or obligations, adhering strictly to relevant statutes, regulations, case law, or established legal precedents. It concerns contracts, agreements, litigation proceedings, regulatory compliance filings, or formal legal opinions, characterized by precise legal terminology and a formal, structured presentation. It is unequivocally *not* informal correspondence, general commentary, or subjective interpretation; it carries specific and demonstrable legal consequences.",
  "Academic Paper": "This document contributes original research findings, novel theoretical frameworks, or rigorous critical analyses to a specific, defined field of academic inquiry. It conforms to established scholarly conventions, including a comprehensive literature review, a clearly articulated methodology, presentation of verifiable evidence, and meticulous citation of sources. This is demonstrably *not* a journalistic article, personal opinion piece, or informal blog post; it is intended for a specialized academic audience and contributes to peer-reviewed scholarly discourse.",
  "General Article": "This document presents news, reports on current events, features stories, opinion pieces, or commentary intended for consumption by the general public. It appears in newspapers, magazines, popular online publications, or blogs, and prioritizes clear, accessible language and engaging storytelling over specialized jargon or formal structure. It is *not* an academic paper, a technical manual, a legal document, or a business proposal; it aims to inform or entertain a broad, non-expert audience.",
  "Other": "This document does not fit the standard formats of technical documentation, business proposals, legal instruments, academic research, or general audience articles. It may be a personal communication (e.g., letter, email), a creative writing piece (e.g., poem, short story), an internal company memo, a transcript of a conversation, or raw data. It lacks the specific purposes and characteristics of the other defined categories."
}
        
        # Initialize with default embeddings
        self.category_embeddings = {}
        self.model = None
        
        try:
            # Load the model (this will download it the first time)
            # Previously using smaller models:
            # self.model = SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')
            # self.model = SentenceTransformer('sentence-transformers/all-MiniLM-L12-v2')
            
            # Using a more powerful model for better accuracy
            # all-mpnet-base-v2 is a stronger model that produces higher quality embeddings
            # with a higher token limit (384 tokens for MiniLM vs 512 for mpnet)
            # Note: This model is larger and may require more memory/processing time
            self.model = SentenceTransformer('sentence-transformers/all-mpnet-base-v2')
            
            # Pre-compute embeddings for categories to improve performance
            self.category_embeddings = self._get_category_embeddings()
        except Exception as e:
            print(f"Error initializing SentenceTransformer: {str(e)}")
            # We'll continue without the model and use fallback classification
    
    def _preprocess_text(self, text: str) -> str:
        """
        Preprocess text by cleaning up whitespace issues, normalizing case,
        and replacing numbers with a token.
        
        Purpose:
        - Standardize text for more consistent embedding and classification
        - Remove variations that might affect classification accuracy
        - Normalize formatting and handle special cases
        
        Args:
            text: The raw document text
            
        Returns:
            Preprocessed text with normalized whitespace, case, and numbers
            ready for embeddings calculation
        """
        # Trim leading/trailing whitespace
        text = text.strip()
        
        # Replace multiple spaces, tabs, and newlines with single spaces
        text = re.sub(r'\s+', ' ', text)
        
        # Replace all numeric values with <num> token
        text = re.sub(r'\b\d+(?:\.\d+)?\b', '<num>', text)
        
        # Convert to lowercase for better matching
        text = text.lower()
        
        return text
    
    def _chunk_text(self, text: str, max_chunk_size: int = 512) -> List[str]:
        """
        Split text into chunks using spaCy sentence segmentation,
        preserving sentence boundaries.
        
        Purpose:
        - Break long documents into manageable chunks for processing
        - Preserve sentence boundaries for better semantic understanding
        - Handle documents that exceed model input size limitations
        - Improve classification quality by analyzing meaningful segments
        
        Args:
            text: The text to chunk
            max_chunk_size: The approximate maximum size of each chunk
            
        Returns:
            List of text chunks, each containing complete sentences and
            respecting the size limit when possible
        """
        # Note: all-mpnet-base-v2 has a higher token limit (512) compared to MiniLM (384)
        # We're using a slightly larger chunk size (512 characters) to take advantage of this
        # while still maintaining a safety margin as character count != token count
        
        # Process the text with spaCy to get sentence boundaries
        doc = nlp(text)
        
        chunks = []
        current_chunk = []
        current_length = 0
        
        # Group sentences into chunks
        for sent in doc.sents:
            sentence = sent.text
            # If adding this sentence would exceed max_chunk_size and we already have content
            if current_length + len(sentence) > max_chunk_size and current_length > 0:
                # Add the current chunk to chunks
                chunks.append(" ".join(current_chunk))
                # Start a new chunk with this sentence
                current_chunk = [sentence]
                current_length = len(sentence)
            else:
                # Add sentence to current chunk
                current_chunk.append(sentence)
                current_length += len(sentence)
        
        # Don't forget to add the last chunk if it contains anything
        if current_chunk:
            chunks.append(" ".join(current_chunk))
            
        # If we don't have any complete sentences (rare but possible),
        # just split by max_chunk_size
        if not chunks:
            return [text[i:i+max_chunk_size] for i in range(0, len(text), max_chunk_size)]
            
        return chunks
    
    def _get_category_embeddings(self) -> Dict[str, np.ndarray]:
        """
        Compute embeddings for all category descriptions.
        
        Purpose:
        - Precompute embeddings for more efficient classification
        - Enable similarity comparisons between documents and categories
        - Cache embeddings to avoid repeated computation
        
        Returns:
            Dictionary mapping category names to their vector embeddings
            as numpy arrays, used for similarity calculations
        """
        embeddings = {}
        category_descriptions = list(self.categories.values())
        
        # Preprocess category descriptions
        preprocessed_descriptions = [self._preprocess_text(desc) for desc in category_descriptions]
        
        # Get embeddings for all categories at once (more efficient)
        all_embeddings = self.model.encode(preprocessed_descriptions)
        
        # Map embeddings back to category names
        for i, category_name in enumerate(self.categories.keys()):
            embeddings[category_name] = all_embeddings[i]
            
        return embeddings
    
    def classify_document(self, text: str) -> Dict[str, float]:
        """
        Classify a document by comparing its embedding to category embeddings.
        For long documents, splits into chunks and averages the results.
        
        Purpose:
        - Determine the most likely category for a document
        - Process document text in manageable chunks
        - Calculate confidence scores for each category
        
        Args:
            text: The document text to classify
            
        Returns:
            Dictionary mapping category names to confidence scores (0-1)
            with higher values indicating stronger matches
        """
        # Check if model is available
        if self.model is None or not self.category_embeddings:
            print("Model not available, using fallback classification")
            return {"Other": 1.0}
        
        try:
            # Preprocess the text
            preprocessed_text = self._preprocess_text(text)
            
            # Split into chunks to handle long documents
            chunks = self._chunk_text(preprocessed_text, 512)
            
            # With the more powerful mpnet model, we can process more chunks for better accuracy
            # MPNet's stronger reasoning capabilities benefit from seeing more document content
            chunks = chunks[:30]
            
            if not chunks:  # If no valid chunks (empty document)
                return {"Other": 1.0}
            
            # Store similarity scores for each chunk
            all_chunk_similarities = {}
            
            # Process each chunk
            for chunk in chunks:
                # Get document embedding for this chunk
                chunk_embedding = self.model.encode([chunk])[0]
                
                # Calculate similarity scores for this chunk
                chunk_similarities = {}
                
                for category, category_embedding in self.category_embeddings.items():
                    # Reshape for cosine_similarity which expects 2D arrays
                    doc_emb_reshaped = chunk_embedding.reshape(1, -1)
                    cat_emb_reshaped = category_embedding.reshape(1, -1)
                    
                    # Get raw cosine similarity (ranges from -1 to 1)
                    raw_similarity = cosine_similarity(doc_emb_reshaped, cat_emb_reshaped)[0][0]
                    
                    # Scale from [-1, 1] to [0, 1] using the formula: (similarity + 1) / 2
                    scaled_similarity = (raw_similarity + 1) / 2
                    
                    # Add to this chunk's similarities
                    chunk_similarities[category] = float(scaled_similarity)
                
                # Store this chunk's similarities
                for category, score in chunk_similarities.items():
                    if category not in all_chunk_similarities:
                        all_chunk_similarities[category] = []
                    all_chunk_similarities[category].append(score)
            
            # Calculate average similarity scores across all chunks
            final_similarities = {}
            for category, scores in all_chunk_similarities.items():
                final_similarities[category] = sum(scores) / len(scores)
            
            # Sort the results by confidence score (highest first)
            sorted_similarities = dict(sorted(final_similarities.items(), key=lambda item: item[1], reverse=True))
            
            return sorted_similarities
        except Exception as e:
            print(f"Error during document classification: {str(e)}")
            return {"Other": 1.0}

    def _get_category_features(self, categories: list) -> dict:
        """
        Create a dictionary of key terms for each category
        
        Purpose:
        - Extract distinguishing terms for each document category
        - Identify important words that characterize each category
        - Support feature-based classification approaches
        
        Args:
            categories: List of category names to process
            
        Returns:
            Dictionary mapping category names to lists of key terms
            that are characteristic of that category
        """
        features = {}
        
        for category in categories:
            if category not in self.categories:
                continue
                
            category_docs = self.categories[category]
            combined_text = " ".join(category_docs)
            
            # Extract important terms using simple frequency
            words = word_tokenize(combined_text.lower())
            words = [w for w in words if w not in stopwords.words('english') and w.isalpha() and len(w) > 3]
            
            word_freq = {}
            for word in words:
                word_freq[word] = word_freq.get(word, 0) + 1
                
            # Sort by frequency and take top terms
            top_terms = sorted(word_freq.items(), key=lambda x: x[1], reverse=True)[:20]
            features[category] = [term[0] for term in top_terms]
            
        return features
        
    def analyze_content(self, text: str) -> Dict[str, float]:
        """
        Analyze document text and return category confidence scores
        
        Purpose:
        - Alternative classification method using similarity-based approach
        - Calculate confidence values for each possible document category
        - Provide normalized probability-like scores for document categorization
        
        Args:
            text: The document text to classify
            
        Returns:
            Dictionary mapping categories to confidence scores (0-1)
            with all scores summing to approximately 1.0
        """
        if not text or not self.category_embeddings:
            # Return equal probabilities if no text or no examples
            return {category: 1.0/len(self.categories) for category in self.categories}
            
        # Preprocess the input text
        preprocessed_text = self._preprocess_text(text)
        
        # Get text features
        text_features = self.model.encode([preprocessed_text])
        
        # Calculate similarity with each category example
        similarities = cosine_similarity(text_features, list(self.category_embeddings.values())).flatten()
        
        # Calculate confidence for each category based on similarities
        category_scores = {}
        for i, score in enumerate(similarities):
            category = list(self.categories.keys())[i]
            if category in category_scores:
                category_scores[category] = max(category_scores[category], score)
            else:
                category_scores[category] = score
                
        # Normalize scores
        total_score = sum(category_scores.values()) or 1  # avoid division by zero
        normalized_scores = {k: v/total_score for k, v in category_scores.items()}
        
        # Ensure all categories have a score
        result = {category: normalized_scores.get(category, 0) for category in self.categories}
        
        # If all scores are very low, assign to "Other"
        if all(score < 0.1 for category, score in result.items() if category != "Other"):
            result = {category: 0.01 for category in self.categories}
            result["Other"] = 0.94
            
        return result
        
    def predict(self, text: str) -> Dict[str, float]:
        """
        Predict the category of the document based on its text content
        
        Purpose:
        - Public interface for document classification
        - Wrapper around the main classification algorithm
        - Maintain backward compatibility with existing code
        
        Args:
            text: The document text to classify
            
        Returns:
            Dictionary mapping categories to confidence scores (0-1),
            with higher values indicating stronger category matches
        """
        return self.classify_document(text) 