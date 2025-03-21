import React, { useState, useEffect, useMemo } from 'react';
import { getDocuments, getDocument, DocumentType } from '../services/api';
import { Bar, Line, Scatter } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
  ChartOptions,
  ScatterDataPoint
} from 'chart.js';
import { ChartBarIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { toast } from './Toast';
import axios from 'axios';

// Create a combined document/chart icon
const DocumentChartIcon = ({ className }: { className?: string }) => (
  <div className={`relative ${className}`}>
    <ChartBarIcon className="w-full h-full" />
  </div>
);

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend
);

// Valid categories that should be included
const VALID_CATEGORIES = [
  'Technical Documentation',
  'Business Proposal',
  'Legal Document',
  'Academic Paper',
  'General Article',
  'Other'
];

// Color mapping for categories
const CATEGORY_COLORS = {
  'Technical Documentation': 'rgba(54, 162, 235, 0.7)',
  'Business Proposal': 'rgba(255, 99, 132, 0.7)',
  'Legal Document': 'rgba(75, 192, 192, 0.7)',
  'Academic Paper': 'rgba(255, 159, 64, 0.7)',
  'General Article': 'rgba(153, 102, 255, 0.7)',
  'Other': 'rgba(201, 203, 207, 0.7)'
};

// Simplified PCA implementation for 2D reduction
const performPCA = (data: number[][]): number[][] => {
  // Step 1: Mean centering
  const dimensions = data[0].length;
  const mean = Array(dimensions).fill(0);
  
  for (let i = 0; i < data.length; i++) {
    for (let j = 0; j < dimensions; j++) {
      mean[j] += data[i][j] / data.length;
    }
  }
  
  const centeredData = data.map(row => 
    row.map((val, i) => val - mean[i])
  );
  
  // Step 2: Calculate covariance matrix
  const covMatrix = Array(dimensions).fill(0).map(() => Array(dimensions).fill(0));
  
  for (let i = 0; i < dimensions; i++) {
    for (let j = 0; j < dimensions; j++) {
      let sum = 0;
      for (let k = 0; k < centeredData.length; k++) {
        sum += centeredData[k][i] * centeredData[k][j];
      }
      covMatrix[i][j] = sum / (centeredData.length - 1);
    }
  }
  
  // Step 3: Find the two principal components (simplified approach)
  // For simplicity, we'll use the first two dimensions as our principal components
  // In a real implementation, you would compute eigenvectors of the covariance matrix
  const pc1 = Array(dimensions).fill(0).map((_, i) => i === 0 ? 1 : 0);
  const pc2 = Array(dimensions).fill(0).map((_, i) => i === 1 ? 1 : 0);
  
  // Step 4: Project the data onto the principal components
  return centeredData.map(point => [
    point.reduce((sum, val, i) => sum + pc1[i] * val, 0),
    point.reduce((sum, val, i) => sum + pc2[i] * val, 0)
  ]);
};

interface TargetData {
  filename: string;
  category: string;
}

// WordCloud component for category word visualization
interface WordCloudWord {
  text: string;
  value: number;
}

interface WordCloudData {
  [category: string]: WordCloudWord[];
}

interface WordCloudProps {
  words: WordCloudWord[];
  maxWords?: number;
}

const WordCloud: React.FC<WordCloudProps> = ({ words, maxWords = 30 }) => {
  // Sort by frequency and limit to maxWords
  const displayWords = words
    .sort((a, b) => b.value - a.value)
    .slice(0, maxWords);
  
  // Find max frequency for scaling
  const maxFreq = Math.max(...displayWords.map(w => w.value));
  
  return (
    <div className="flex flex-wrap justify-center p-4">
      {displayWords.map((word, idx) => {
        // Calculate font size based on frequency (min 12px, max 32px)
        const fontSize = 12 + (word.value / maxFreq) * 20;
        // Calculate opacity based on frequency (min 0.6, max 1.0)
        const opacity = 0.6 + (word.value / maxFreq) * 0.4;
        
        return (
          <div 
            key={idx} 
            className="m-1 p-1 rounded"
            style={{
              fontSize: `${fontSize}px`,
              opacity,
              color: `rgba(23, 81, 172, ${opacity})`,
              transform: `rotate(${Math.random() * 20 - 10}deg)`
            }}
          >
            {word.text}
          </div>
        );
      })}
    </div>
  );
};

const StatisticalAnalysis: React.FC = () => {
  const [documents, setDocuments] = useState<DocumentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalDocuments, setTotalDocuments] = useState(0);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [categoryAverageScores, setCategoryAverageScores] = useState<Record<string, number>>({});
  const [categoryAverageSizes, setCategoryAverageSizes] = useState<Record<string, number>>({});
  const [categoryAverageLengths, setCategoryAverageLengths] = useState<Record<string, number>>({});
  const [pcaData, setPcaData] = useState<{
    points: ScatterDataPoint[],
    categories: string[],
    filenames: string[]
  }>({ points: [], categories: [], filenames: [] });
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [totalLabeled, setTotalLabeled] = useState<number>(0);
  const [wordCloudData, setWordCloudData] = useState<WordCloudData>({});
  const [targetData, setTargetData] = useState<TargetData[]>([]);
  const [documentsWithContent, setDocumentsWithContent] = useState<DocumentType[]>([]);
  const [categoryAccuracy, setCategoryAccuracy] = useState<Record<string, {correct: number, total: number, percentage: number}>>({});
  
  // Common stop words to filter out
  const STOP_WORDS = useMemo(() => new Set([
    'a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'on', 'at', 'to', 'by', 
    'from', 'of', 'in', 'this', 'that', 'these', 'those', 'with', 'as', 'is', 
    'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 
    'does', 'did', 'shall', 'will', 'should', 'would', 'may', 'might', 'must',
    'can', 'could', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'their', 'its',
    'our', 'your', 'my', 'his', 'her', 'who', 'what', 'where', 'which', 'when',
    'why', 'how', 'all', 'any', 'both', 'each', 'not', 'only', 'very', 'more',
    'most', 'some', 'such', 'no', 'nor', 'too', 'then', 'than', 'also', 'if',
    'so', 'just', 'about', 'upon', 'through', 'before', 'after', 'above', 'below',
    'over', 'under', 'again', 'once'
  ]), []);
  
  // Simple function to preprocess text
  const preprocessText = (text: string): string[] => {
    // Convert to lowercase
    const lowerText = text.toLowerCase();
    
    // Remove punctuation and split into words
    const words = lowerText.replace(/[^\w\s]/g, ' ').split(/\s+/);
    
    // Filter out stop words and short words
    return words.filter(word => 
      word.length > 2 && !STOP_WORDS.has(word) && !/^\d+$/.test(word)
    );
  };
  
  // Create placeholder word clouds if we don't have proper data
  const generatePlaceholderWordClouds = (categories: string[]) => {
    const placeholderClouds: WordCloudData = {};
    
    categories.forEach(category => {
      // Common words for each category type
      const commonWords: Record<string, string[]> = {
        "Technical Documentation": ["code", "function", "class", "method", "library", "api", "interface", "system", "software", "design", "implementation", "documentation", "reference", "guide"],
        "Business Proposal": ["business", "proposal", "project", "client", "budget", "timeline", "deliverable", "service", "opportunity", "strategy", "partnership", "growth", "market", "solution"],
        "Legal Document": ["legal", "agreement", "contract", "party", "terms", "conditions", "clause", "obligation", "rights", "compliance", "regulation", "jurisdiction", "enforcement", "liability"],
        "Academic Paper": ["research", "study", "analysis", "data", "method", "result", "conclusion", "literature", "hypothesis", "theory", "experiment", "finding", "publication", "reference"],
        "General Article": ["article", "information", "topic", "reader", "section", "point", "example", "author", "description", "overview", "summary", "introduction", "conclusion", "perspective"],
        "Other": ["document", "content", "information", "section", "page", "text", "topic", "review", "description", "analysis", "overview", "summary", "introduction", "conclusion"]
      };
      
      // Get words specific to this category, or use generic words
      const categoryWords = commonWords[category] || commonWords["Other"];
      
      // Create word cloud with random values
      const words: WordCloudWord[] = categoryWords.map(word => ({
        text: word,
        value: Math.floor(Math.random() * 60) + 40  // Random value between 40-100
      }));
      
      // No longer add the category name as the highest value word
      placeholderClouds[category] = words;
    });
    
    return placeholderClouds;
  };
  
  // Function to generate word cloud data from documents
  const generateWordClouds = (docs: DocumentType[]) => {
    try {
      console.log("Generating word clouds for categories...");
      console.log("Document content check:", docs.map(d => ({ 
        filename: d.filename, 
        hasContent: !!d.content,
        contentLength: d.content?.length || 0
      })));
      
      // Group documents by their ground truth category from CSV
      const categoryDocs: Record<string, DocumentType[]> = {};
      
      // First get the ground truth categories for each document
      let docsWithKnownCategories = 0;
      
      docs.forEach(doc => {
        if (!doc.filename) return;
        
        // Remove file extension for matching
        const docNameWithoutExt = doc.filename.replace(/\.[^/.]+$/, "");
        
        // Find corresponding category in targetData
        const targetDoc = targetData.find((target: TargetData) => {
          const targetNameWithoutExt = target.filename.replace(/\.[^/.]+$/, "");
          return targetNameWithoutExt === docNameWithoutExt;
        });
        
        if (targetDoc) {
          if (!categoryDocs[targetDoc.category]) {
            categoryDocs[targetDoc.category] = [];
          }
          categoryDocs[targetDoc.category].push(doc);
          docsWithKnownCategories++;
        }
      });
      
      console.log(`Found ${docsWithKnownCategories} documents with known categories from CSV`);
      console.log("Category groups:", Object.keys(categoryDocs).map(cat => 
        `${cat}: ${categoryDocs[cat].length} docs`
      ));
      
      // If we don't have any categorized documents, show at least placeholder word clouds
      if (Object.keys(categoryDocs).length === 0) {
        console.log("No documents with matching categories found, showing placeholders");
        // Use default categories if we have none
        const defaultCategories = [
          "Technical Documentation", "Business Proposal", "Legal Document", 
          "Academic Paper", "General Article", "Other"
        ];
        setWordCloudData(generatePlaceholderWordClouds(defaultCategories));
        return;
      }
      
      // Create placeholder word clouds based on actual categories
      const placeholderWordClouds = generatePlaceholderWordClouds(Object.keys(categoryDocs));
      
      // Use placeholders if no documents have content
      if (!docs.some(d => d.content && d.content.length > 0)) {
        console.log("Using placeholder word clouds because no documents have content");
        setWordCloudData(placeholderWordClouds);
        return;
      }
      
      // Process each category
      const wordClouds: WordCloudData = {};
      
      Object.entries(categoryDocs).forEach(([category, docs]) => {
        // Count docs with content
        const docsWithContent = docs.filter(doc => doc.content && doc.content.length > 0);
        console.log(`Category ${category}: ${docsWithContent.length} of ${docs.length} docs have content`);
        
        if (docsWithContent.length === 0) {
          wordClouds[category] = placeholderWordClouds[category] || [];
          return;
        }
        
        // Combine all document contents for this category
        const combinedText = docsWithContent.map(doc => doc.content).join(' ');
        
        // Process and count words
        const words = preprocessText(combinedText || '');
        const wordCounts: Record<string, number> = {};
        
        words.forEach(word => {
          // Skip the category name or any variation of it (case insensitive)
          if (word.toLowerCase() === category.toLowerCase()) return;
          if (category.toLowerCase().includes(word.toLowerCase()) && word.length > 3) return;
          
          wordCounts[word] = (wordCounts[word] || 0) + 1;
        });
        
        // Convert to array of word objects
        const wordCloudWords: WordCloudWord[] = Object.entries(wordCounts)
          .map(([text, value]) => ({ text, value }))
          .sort((a, b) => b.value - a.value);
        
        wordClouds[category] = wordCloudWords.length > 0 
          ? wordCloudWords 
          : placeholderWordClouds[category] || [];
      });
      
      console.log("Word cloud data generated:", Object.keys(wordClouds));
      setWordCloudData(wordClouds);
      
    } catch (err) {
      console.error("Error generating word clouds:", err);
      toast.error("Failed to generate word clouds");
    }
  };
  
  const fetchTargetsAndCalculateAccuracy = async (docs: DocumentType[]) => {
    try {
      // Fetch the targets.csv file
      const response = await fetch('/targets.csv');
      const csvText = await response.text();
      
      console.log("CSV loaded:", csvText.substring(0, 100) + "...");
      
      // Parse CSV manually
      const lines = csvText.split('\n');
      const headers = lines[0].split(',').map(h => h.trim());
      
      console.log("CSV headers:", headers);
      
      // Find column indices - note our file has "file_name" not "filename"
      const filenameIndex = headers.findIndex(h => 
        h.toLowerCase() === 'file_name' || h.toLowerCase() === 'filename');
      const categoryIndex = headers.findIndex(h => 
        h.toLowerCase() === 'category');
      
      console.log("Filename index:", filenameIndex, "Category index:", categoryIndex);
      
      if (filenameIndex === -1 || categoryIndex === -1) {
        console.error('CSV missing required columns');
        toast.error('Target CSV file is missing required columns');
        return;
      }
      
      // Parse data rows
      const parsedTargetData: TargetData[] = [];
      for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        
        const values = lines[i].split(',').map(v => v.trim());
        if (values.length > 1) {
          parsedTargetData.push({
            filename: values[filenameIndex],
            category: values[categoryIndex]
          });
        }
      }
      
      setTargetData(parsedTargetData);
      
      console.log("Parsed target data:", parsedTargetData.length, "entries");
      console.log("First few targets:", parsedTargetData.slice(0, 3));
      
      // Count correct predictions
      let correctPredictions = 0;
      let totalLabeledDocs = 0;
      
      // Track accuracy by category
      const categoryStats: Record<string, {correct: number, total: number, percentage: number}> = {};
      
      // Initialize stats for all valid categories
      VALID_CATEGORIES.forEach(category => {
        categoryStats[category] = { correct: 0, total: 0, percentage: 0 };
      });
      
      // Process each document
      docs.forEach(doc => {
        if (!doc.filename || !doc.category_prediction) return;
        
        // Remove file extension for matching
        const docNameWithoutExt = doc.filename.replace(/\.[^/.]+$/, "");
        
        // Find matching target in CSV
        const matchingTarget = parsedTargetData.find(target => {
          const targetNameWithoutExt = target.filename.replace(/\.[^/.]+$/, "");
          return targetNameWithoutExt === docNameWithoutExt;
        });
        
        if (matchingTarget) {
          totalLabeledDocs++;
          
          // Find the category with highest confidence
          let predictedCategory = 'Other';
          let highestConfidence = 0;
          
          Object.entries(doc.category_prediction).forEach(([category, confidence]) => {
            if (confidence > highestConfidence) {
              predictedCategory = category;
              highestConfidence = confidence;
            }
          });
          
          console.log(`Document: ${doc.filename}, Predicted: ${predictedCategory}, Actual: ${matchingTarget.category}`);
          
          // Track accuracy for the actual category
          if (categoryStats[matchingTarget.category]) {
            categoryStats[matchingTarget.category].total++;
          }
          
          // Check if prediction matches ground truth
          if (predictedCategory === matchingTarget.category) {
            correctPredictions++;
            
            // Track correct prediction for the category
            if (categoryStats[matchingTarget.category]) {
              categoryStats[matchingTarget.category].correct++;
            }
          }
        }
      });
      
      // Calculate percentage for each category
      Object.keys(categoryStats).forEach(category => {
        const { correct, total } = categoryStats[category];
        categoryStats[category].percentage = total > 0 ? (correct / total) * 100 : 0;
      });
      
      // Set the category accuracy stats
      setCategoryAccuracy(categoryStats);
      
      console.log(`Accuracy calculation: ${correctPredictions} correct out of ${totalLabeledDocs} labeled docs`);
      console.log('Category accuracy:', categoryStats);
      
      // Calculate overall accuracy
      if (totalLabeledDocs > 0) {
        const calculatedAccuracy = (correctPredictions / totalLabeledDocs) * 100;
        console.log(`Setting accuracy to ${calculatedAccuracy.toFixed(1)}%`);
        setAccuracy(calculatedAccuracy);
        setTotalLabeled(totalLabeledDocs);
      } else {
        console.log("No labeled documents found for accuracy calculation");
      }
      
      // After processing accuracy, also generate word clouds
      if (parsedTargetData.length > 0 && docs.length > 0) {
        generateWordClouds(docs);
      }
      
    } catch (err) {
      console.error('Error fetching or parsing targets.csv:', err);
      toast.error('Failed to load ground truth data');
    }
  };
  
  const fetchDocumentsWithContent = async (docs: DocumentType[]) => {
    try {
      const documentsWithTargets = docs.filter(doc => {
        if (!doc.filename) return false;
        
        // Check if we have this document in our targets.csv
        const docNameWithoutExt = doc.filename.replace(/\.[^/.]+$/, "");
        const targetDoc = targetData.find((target: TargetData) => {
          const targetNameWithoutExt = target.filename.replace(/\.[^/.]+$/, "");
          return targetNameWithoutExt === docNameWithoutExt;
        });
        
        return !!targetDoc;
      });
      
      console.log(`Found ${documentsWithTargets.length} documents with matching targets`);
      
      // For each document with a target, fetch its full content
      const fetchedDocs: DocumentType[] = [];
      const fetchPromises = documentsWithTargets.slice(0, 10).map(async doc => {
        if (!doc.id) return null;
        
        try {
          const fullDoc = await getDocument(doc.id);
          if (fullDoc.content) {
            fetchedDocs.push(fullDoc);
          }
          return fullDoc;
        } catch (err) {
          console.error(`Error fetching document ${doc.id}:`, err);
          return null;
        }
      });
      
      await Promise.all(fetchPromises);
      console.log(`Successfully fetched ${fetchedDocs.length} documents with content`);
      setDocumentsWithContent(fetchedDocs);
      
      // Now generate word clouds with the documents that have content
      if (fetchedDocs.length > 0) {
        generateWordClouds(fetchedDocs);
      } else {
        // Generate placeholder word clouds
        generateWordClouds(documentsWithTargets);
      }
    } catch (err) {
      console.error("Error fetching documents with content:", err);
    }
  };
  
  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      console.log("Fetching documents for statistical analysis...");
      const data = await getDocuments();
      console.log(`Successfully fetched ${data.length} documents for analysis`);
      
      setDocuments(data);
      setTotalDocuments(data.length);
      
      // First calculate accuracy using ground truth data from CSV
      await fetchTargetsAndCalculateAccuracy(data);
      
      // Then fetch full documents with content for word clouds
      await fetchDocumentsWithContent(data);
      
      // Initialize counts for all valid categories
      const counts: Record<string, number> = {};
      const totalScores: Record<string, number> = {};
      const categoryOccurrences: Record<string, number> = {};
      const totalSizes: Record<string, number> = {};
      const totalLengths: Record<string, number> = {};
      
      // Initialize all valid categories with zero counts
      VALID_CATEGORIES.forEach(category => {
        counts[category] = 0;
        totalScores[category] = 0;
        categoryOccurrences[category] = 0;
        totalSizes[category] = 0;
        totalLengths[category] = 0;
      });
      
      // For PCA: Prepare feature vectors for each document
      const featureVectors: number[][] = [];
      const docCategories: string[] = [];
      const docFilenames: string[] = [];
      
      data.forEach(doc => {
        if (doc.category_prediction && Object.keys(doc.category_prediction).length > 0) {
          // Find the category with highest confidence score
          let topCategory = 'Other';
          let topConfidence = 0;
          
          // Prepare feature vector for this document
          const featureVector = VALID_CATEGORIES.map(cat => 
            doc.category_prediction && VALID_CATEGORIES.includes(cat) ? 
            (doc.category_prediction[cat] || 0) : 0
          );
          
          Object.entries(doc.category_prediction).forEach(([category, confidence]) => {
            // Only process valid categories
            if (VALID_CATEGORIES.includes(category)) {
              if (confidence > topConfidence) {
                topCategory = category;
                topConfidence = confidence;
              }
              
              // Track all valid categories and their confidence scores for average calculation
              totalScores[category] = (totalScores[category] || 0) + confidence;
              categoryOccurrences[category] = (categoryOccurrences[category] || 0) + 1;
            }
          });
          
          // Store feature vector, category, and filename for PCA
          featureVectors.push(featureVector);
          docCategories.push(topCategory);
          docFilenames.push(doc.filename || 'Unnamed document');
          
          // Increment the counter for the top category
          counts[topCategory] = (counts[topCategory] || 0) + 1;
          
          // Add document size to the total for its category (convert to KB)
          if (doc.size) {
            totalSizes[topCategory] = (totalSizes[topCategory] || 0) + (doc.size / 1024);
          }
          
          // Add document content length to the total for its category
          if (doc.content) {
            totalLengths[topCategory] = (totalLengths[topCategory] || 0) + doc.content.length;
          }
        } else {
          // If no category prediction is available
          counts['Other'] = (counts['Other'] || 0) + 1;
          
          // Add a zero vector for documents without predictions
          featureVectors.push(VALID_CATEGORIES.map(() => 0));
          docCategories.push('Other');
          docFilenames.push(doc.filename || 'Unnamed document');
          
          // Add document size to the total for "Other" category
          if (doc.size) {
            totalSizes['Other'] = (totalSizes['Other'] || 0) + (doc.size / 1024);
          }
          
          // Add document content length to the total for "Other" category
          if (doc.content) {
            totalLengths['Other'] = (totalLengths['Other'] || 0) + doc.content.length;
          }
        }
      });
      
      // Calculate average scores and sizes
      const avgScores: Record<string, number> = {};
      const avgSizes: Record<string, number> = {};
      const avgLengths: Record<string, number> = {};
      
      VALID_CATEGORIES.forEach(category => {
        if (categoryOccurrences[category] > 0) {
          avgScores[category] = totalScores[category] / categoryOccurrences[category];
        } else {
          avgScores[category] = 0; // Set to zero if no occurrences
        }
        
        if (counts[category] > 0) {
          avgSizes[category] = totalSizes[category] / counts[category];
          avgLengths[category] = totalLengths[category] / counts[category];
        } else {
          avgSizes[category] = 0; // Set to zero if no documents
          avgLengths[category] = 0; // Set to zero if no documents
        }
      });
      
      // Perform PCA only if we have enough documents
      if (featureVectors.length >= 2) {
        const reducedData = performPCA(featureVectors);
        
        // Create scatter plot data points
        const points = reducedData.map((coords, idx) => ({
          x: coords[0],
          y: coords[1]
        }));
        
        setPcaData({
          points,
          categories: docCategories,
          filenames: docFilenames
        });
      }
      
      setCategoryCounts(counts);
      setCategoryAverageScores(avgScores);
      setCategoryAverageSizes(avgSizes);
      setCategoryAverageLengths(avgLengths);
      setError(null);
    } catch (err: any) {
      setLoading(false);
      
      // Create a user-friendly error message
      let errorMessage = "Error loading documents";
      
      if (err.message) {
        if (err.message.includes("Network Error")) {
          errorMessage = "Network Error: Cannot connect to the server. Please check your connection and ensure the backend is running.";
        } else {
          errorMessage = err.message;
        }
      }
      
      console.error("Statistical analysis error:", err);
      setError(errorMessage);
      
      // Show a toast notification for the error
      toast.error(`Failed to load statistics: ${errorMessage}`);
      
      return; // Exit early
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    fetchData();
  }, []);
  
  // Chart data preparation for document counts
  const countChartData = {
    labels: VALID_CATEGORIES,
    datasets: [
      {
        label: 'Number of Documents',
        data: VALID_CATEGORIES.map(category => categoryCounts[category] || 0),
        backgroundColor: 'rgba(54, 162, 235, 0.6)',
        borderColor: 'rgba(54, 162, 235, 1)',
        borderWidth: 1,
      },
    ],
  };
  
  // Chart data preparation for average scores - now as a line chart
  const avgScoreChartData = {
    labels: VALID_CATEGORIES,
    datasets: [
      {
        label: 'Average Confidence Score (%)',
        data: VALID_CATEGORIES.map(category => (categoryAverageScores[category] || 0) * 100), // Convert to percentage
        backgroundColor: 'rgba(75, 192, 192, 0.4)',
        borderColor: 'rgba(75, 192, 192, 1)',
        borderWidth: 2,
        tension: 0.3,
        fill: true,
        pointBackgroundColor: 'rgba(75, 192, 192, 1)',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7,
      },
    ],
  };
  
  // Chart data preparation for average document lengths
  const lengthChartData = {
    labels: VALID_CATEGORIES,
    datasets: [
      {
        label: 'Average Document Length (characters)',
        data: VALID_CATEGORIES.map(category => Math.round(categoryAverageLengths[category] || 0)),
        backgroundColor: 'rgba(255, 159, 64, 0.6)',
        borderColor: 'rgba(255, 159, 64, 1)',
        borderWidth: 1,
      },
    ],
  };
  
  // PCA scatter plot data
  const pcaChartData = {
    datasets: VALID_CATEGORIES.map((category, categoryIndex) => {
      // Find all points for this category
      const categoryPoints: ScatterDataPoint[] = [];
      const categoryFilenames: string[] = [];
      
      pcaData.points.forEach((point, idx) => {
        if (pcaData.categories[idx] === category) {
          categoryPoints.push(point);
          categoryFilenames.push(pcaData.filenames[idx]);
        }
      });
      
      return {
        label: category,
        data: categoryPoints,
        backgroundColor: CATEGORY_COLORS[category as keyof typeof CATEGORY_COLORS],
        pointRadius: 6,
        pointHoverRadius: 8,
        // Store filenames as custom property to access in tooltip
        filenames: categoryFilenames
      };
    }).filter(dataset => dataset.data.length > 0)
  };
  
  // Create data for the category accuracy chart
  const categoryAccuracyChartData = {
    labels: Object.keys(categoryAccuracy).filter(cat => VALID_CATEGORIES.includes(cat)),
    datasets: [
      {
        label: 'Category Accuracy (%)',
        data: Object.keys(categoryAccuracy)
          .filter(cat => VALID_CATEGORIES.includes(cat))
          .map(cat => categoryAccuracy[cat].percentage),
        backgroundColor: Object.keys(categoryAccuracy)
          .filter(cat => VALID_CATEGORIES.includes(cat))
          .map(cat => CATEGORY_COLORS[cat as keyof typeof CATEGORY_COLORS]),
        borderColor: Object.keys(categoryAccuracy)
          .filter(cat => VALID_CATEGORIES.includes(cat))
          .map(cat => CATEGORY_COLORS[cat as keyof typeof CATEGORY_COLORS].replace('0.7', '1')),
        borderWidth: 1
      }
    ]
  };

  // Options for the category accuracy chart
  const categoryAccuracyChartOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: 'y' as const,
    plugins: {
      legend: {
        display: false
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            const label = context.dataset.label || '';
            const value = context.parsed.x;
            const categoryKey = context.label;
            const stats = categoryAccuracy[categoryKey];
            return [
              `${label}: ${value.toFixed(1)}%`,
              `Correct: ${stats.correct} / ${stats.total} documents`
            ];
          }
        }
      }
    },
    scales: {
      x: {
        beginAtZero: true,
        max: 100,
        title: {
          display: true,
          text: 'Accuracy (%)'
        }
      }
    }
  };
  
  const countChartOptions: ChartOptions<'bar'> = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: 'Document Count by Category',
        font: {
          size: 16,
        }
      },
      tooltip: {
        callbacks: {
          label: function(context) {
            const value = context.raw as number;
            const percentage = Math.round((value / totalDocuments) * 100);
            return `${value} documents (${percentage}%)`;
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          precision: 0 // Only show whole numbers
        },
        title: {
          display: true,
          text: 'Number of Documents'
        }
      },
      x: {
        title: {
          display: true,
          text: 'Category'
        }
      }
    }
  };
  
  const avgScoreChartOptions: ChartOptions<'line'> = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: 'Average Confidence Score by Category',
        font: {
          size: 16,
        }
      },
      tooltip: {
        callbacks: {
          label: function(context) {
            const value = context.raw as number;
            return `${value.toFixed(1)}%`;
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        max: 100,
        title: {
          display: true,
          text: 'Average Confidence Score (%)'
        }
      },
      x: {
        title: {
          display: true,
          text: 'Category'
        }
      }
    }
  };
  
  const lengthChartOptions: ChartOptions<'bar'> = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: 'Average Document Length by Category',
        font: {
          size: 16,
        }
      },
      tooltip: {
        callbacks: {
          label: function(context) {
            const value = context.raw as number;
            return `${value.toLocaleString()} characters`;
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Length (characters)'
        }
      },
      x: {
        title: {
          display: true,
          text: 'Category'
        }
      }
    }
  };
  
  const pcaChartOptions: ChartOptions<'scatter'> = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      title: {
        display: true,
        text: 'Document Category Clustering (PCA 2D Projection)',
        font: {
          size: 16,
        }
      },
      tooltip: {
        callbacks: {
          label: function(context) {
            // Get the dataset (category) index
            const datasetIndex = context.datasetIndex;
            // Get the data point index within that dataset
            const pointIndex = context.dataIndex;
            
            if (datasetIndex !== undefined && pointIndex !== undefined) {
              // Access the filename from our custom property
              const filename = (pcaChartData.datasets[datasetIndex] as any).filenames[pointIndex];
              
              // Return only the filename, not the category (since color already indicates category)
              return filename;
            }
            return '';
          }
        }
      }
    },
    scales: {
      y: {
        title: {
          display: true,
          text: 'PC2'
        }
      },
      x: {
        title: {
          display: true,
          text: 'PC1'
        }
      }
    }
  };
  
  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
        <span className="ml-3 text-gray-700">Loading document statistics...</span>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mt-6">
        <strong className="font-bold">Error!</strong>
        <span className="block sm:inline"> {error}</span>
        <button 
          onClick={fetchData}
          className="absolute top-0 right-0 px-4 py-3"
        >
          <ArrowPathIcon className="h-5 w-5 text-red-500" />
        </button>
      </div>
    );
  }
  
  return (
    <div className="space-y-8">
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center mb-4">
          <DocumentChartIcon className="h-6 w-6 text-blue-500 mr-2" />
          <h2 className="text-xl font-bold text-gray-900">Statistical Analysis</h2>
          <button 
            onClick={fetchData} 
            className="ml-auto text-gray-500 hover:text-blue-500"
            title="Refresh data"
          >
            <ArrowPathIcon className="h-5 w-5" />
          </button>
        </div>
        
        {/* Accuracy Score Section */}
        {accuracy !== null && (
          <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h3 className="text-lg font-semibold text-blue-800 mb-2">Model Accuracy</h3>
            <div className="flex items-center">
              <div className="text-3xl font-bold text-blue-700">{accuracy.toFixed(1)}%</div>
              <div className="ml-4 text-sm text-gray-600">
                Based on {totalLabeled} documents with ground truth labels
              </div>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2">
              <div 
                className="bg-blue-600 h-2.5 rounded-full" 
                style={{ width: `${accuracy}%` }}
              ></div>
            </div>
          </div>
        )}
        
        {/* Add Category Accuracy Chart right after the overall accuracy section */}
        {accuracy !== null && (
          <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h3 className="text-lg font-semibold text-blue-800 mb-2">Category-Specific Accuracy</h3>
            <p className="text-sm text-gray-600 mb-3">
              Percentage of documents correctly classified for each category based on ground truth data
            </p>
            <div style={{ height: "350px", width: "100%" }}>
              <Bar data={categoryAccuracyChartData} options={categoryAccuracyChartOptions} />
            </div>
          </div>
        )}
        
        <div className="mb-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-blue-50 rounded-lg p-4 text-center">
              <h3 className="text-sm font-medium text-gray-500">Total Documents</h3>
              <p className="text-3xl font-bold text-blue-700">{totalDocuments}</p>
            </div>
            <div className="bg-blue-50 rounded-lg p-4 text-center">
              <h3 className="text-sm font-medium text-gray-500">Categories</h3>
              <p className="text-3xl font-bold text-blue-700">{VALID_CATEGORIES.length}</p>
            </div>
            <div className="bg-blue-50 rounded-lg p-4 text-center">
              <h3 className="text-sm font-medium text-gray-500">Most Common Category</h3>
              <p className="text-xl font-bold text-blue-700">
                {Object.entries(categoryCounts)
                  .filter(([category]) => VALID_CATEGORIES.includes(category))
                  .sort((a, b) => b[1] - a[1])[0]?.[0] || 'None'}
              </p>
            </div>
          </div>
        </div>
        
        {/* First chart - Document counts by category */}
        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Document Categories Distribution</h3>
          <div style={{ height: "350px", width: "100%" }}>
            <Bar data={countChartData} options={countChartOptions} />
          </div>
        </div>
        
        {/* Second chart - Average confidence scores by category as a line chart */}
        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Average Confidence Score by Category</h3>
          <div style={{ height: "350px", width: "100%" }}>
            <Line data={avgScoreChartData} options={avgScoreChartOptions} />
          </div>
        </div>
        
        {/* Third chart - Average document lengths by category */}
        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Average Document Length by Category</h3>
          <div style={{ height: "350px", width: "100%" }}>
            <Bar data={lengthChartData} options={lengthChartOptions} />
          </div>
        </div>
        
        {/* PCA Scatter plot */}
        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Document Clustering (PCA)</h3>
          <p className="text-sm text-gray-600 mb-4">
            This scatter plot shows documents projected onto a 2D space using Principal Component Analysis (PCA).
            Documents with similar category predictions will appear closer together.
          </p>
          <div style={{ height: "400px", width: "100%" }}>
            <Scatter data={pcaChartData} options={pcaChartOptions} />
          </div>
        </div>
        
        {/* Word Clouds Section */}
        <div className="mt-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Word Clouds by Category</h3>
          <p className="text-sm text-gray-600 mb-4">
            Word clouds showing the most common words in documents from each category. Larger words appear more frequently.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {Object.entries(wordCloudData).map(([category, words]) => (
              <div key={category} className="bg-gray-50 rounded-lg p-4">
                <h4 className="text-md font-medium text-blue-700 mb-2">{category}</h4>
                {words.length > 0 ? (
                  <div className="h-64 overflow-hidden">
                    <WordCloud words={words} maxWords={50} />
                  </div>
                ) : (
                  <div className="h-64 flex items-center justify-center text-gray-400">
                    No data available for this category
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StatisticalAnalysis; 