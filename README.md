# News Aggregator Project

A news aggregator application that scrapes and displays news from multiple trusted sources.

## Project Structure

- `frontend/`: Next.js frontend
- `backend/`: FastAPI backend

## Backend Setup

1. Navigate to the backend directory:
   ```
   cd backend
   ```

2. Create a virtual environment:
   ```
   python -m venv venv
   ```

3. Activate the virtual environment:
   - Windows:
     ```
     venv\Scripts\activate
     ```
   - macOS/Linux:
     ```
     source venv/bin/activate
     ```

4. Install dependencies:
   ```
   pip install -r requirements.txt
   ```

5. Run the backend server:
   ```
   uvicorn app.main:app --reload
   ```

6. The API will be available at `http://localhost:8000`
   - API documentation: `http://localhost:8000/docs`

## Frontend Setup

1. Navigate to the frontend directory:
   ```
   cd frontend
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env.local` file with the following content:
   ```
   NEXT_PUBLIC_API_URL=http://localhost:8000/api
   ```

4. Run the development server:
   ```
   npm run dev
   ```

5. The frontend will be available at `http://localhost:3000`

## Features

- News aggregation from multiple sources (BBC, CNN, Reuters)
- Filter news by source
- Automatic news refresh
- Responsive design

## Technology Stack

- **Frontend**: Next.js, TypeScript, Tailwind CSS
- **Backend**: FastAPI, BeautifulSoup
- **Database**: NeonDB (optional)
