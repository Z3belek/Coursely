const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const multer = require('multer');

const port = process.env.BACKEND_PORT || 4000;
const host = process.env.BACKEND_HOST || '0.0.0.0';

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ dest: 'uploads/' });

const videosDir = path.join(__dirname, '..', '..', 'videos');
const publicDir = path.join(__dirname, '..', 'public');
const dbPath = path.join(__dirname, '..', 'database', 'profiles.db');

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error al conectar con la base de datos:', err.message);
    process.exit(1);
  }
  console.log('Successfully connected to the database');

  db.all("PRAGMA table_info(progress)", (err, rows) => {
    if (err) {
      console.error('Error al verificar la tabla progress:', err.message);
      return;
    }
    const hasCourseName = rows.some(row => row.name === 'courseName');
    const hasSection = rows.some(row => row.name === 'section');
    if (!hasCourseName || !hasSection) {
      db.run('DROP TABLE IF EXISTS progress', (err) => {
        if (err) console.error('Error al eliminar la tabla progress:', err.message);
        db.run(`
          CREATE TABLE progress (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            profileName TEXT NOT NULL,
            courseName TEXT NOT NULL,
            section TEXT NOT NULL,
            video TEXT NOT NULL,
            position REAL DEFAULT 0,
            FOREIGN KEY (profileName) REFERENCES profiles(profileName),
            FOREIGN KEY (courseName) REFERENCES courses(folderName)
          )
        `, (err) => {
          if (err) console.error('Error al crear la tabla progress:', err.message);
        });
      });
    }
  });

  db.run(`
    CREATE TABLE IF NOT EXISTS courses (
      folderName TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      imagePath TEXT,
      udemyId TEXT,
      UNIQUE (folderName)
    )
  `, (err) => {
    if (err) console.error('Error al crear la tabla courses:', err.message);
  });

  db.run(`
    CREATE TABLE IF NOT EXISTS profiles (
      profileName TEXT PRIMARY KEY
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profileName TEXT NOT NULL,
      courseName TEXT NOT NULL,
      section TEXT NOT NULL,
      video TEXT NOT NULL,
      position REAL DEFAULT 0,
      FOREIGN KEY (profileName) REFERENCES profiles(profileName),
      FOREIGN KEY (courseName) REFERENCES courses(folderName)
    )
  `);
});

app.use('/public', express.static(publicDir));

app.put('/courses/:courseName', upload.single('image'), (req, res) => {
  const { courseName } = req.params;
  const { title, udemyId } = req.body;
  let imagePath = null;

  if (req.body.image === '' && !req.file) {
    db.get('SELECT imagePath FROM courses WHERE folderName = ?', [courseName], (err, row) => {
      if (err) {
        console.error('Error al consultar imagen previa:', err.message);
        return res.status(500).json({ error: err.message });
      }
      if (row?.imagePath) {
        const oldImagePath = path.join(publicDir, path.basename(row.imagePath));
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
          console.log(`Imagen eliminada: ${oldImagePath}`);
        }
      }
      updateCourse(null);
    });
  } else if (req.file) {
    const imageName = `${Date.now()}-${req.file.originalname}`.replace(/\s/g, '-');
    const imagePathFull = path.join(publicDir, imageName);
    fs.renameSync(req.file.path, imagePathFull);
    console.log(`Imagen guardada en: ${imagePathFull}`);
    imagePath = `${req.protocol}://${req.get('host')}/public/${imageName}`;
    updateCourse(imagePath);
  } else {
    db.get('SELECT imagePath FROM courses WHERE folderName = ?', [courseName], (err, row) => {
      if (err) {
        console.error('Error al consultar imagen previa:', err.message);
        return res.status(500).json({ error: err.message });
      }
      updateCourse(row?.imagePath || null);
    });
  }

  function updateCourse(imagePathValue) {
    db.run(
      'UPDATE courses SET title = ?, imagePath = ?, udemyId = ? WHERE folderName = ?',
      [title || null, imagePathValue, udemyId || null, courseName],
      (err) => {
        if (err) {
          console.error('Error al actualizar curso:', err.message);
          return res.status(500).json({ error: err.message });
        }
        console.log(`Curso ${courseName} actualizado con title=${title}, imagePath=${imagePathValue}, udemyId=${udemyId}`);
        res.json({ message: 'Curso actualizado', courseName, imagePath: imagePathValue });
      }
    );
  }
});

app.get('/video/:course/:section/:video', (req, res) => {
  const course = req.params.course;
  const section = req.params.section;
  const video = req.params.video;
  const videoPath = path.join(videosDir, course, section, `${video}.mp4`);

  if (fs.existsSync(videoPath)) {
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Accept-Ranges', 'bytes');

    const range = req.headers.range;
    if (range) {
      const videoSize = fs.statSync(videoPath).size;
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : videoSize - 1;
      const chunkSize = (end - start) + 1;

      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${videoSize}`);
      res.setHeader('Content-Length', chunkSize);

      const videoStream = fs.createReadStream(videoPath, { start, end });
      videoStream.pipe(res);
    } else {
      res.setHeader('Content-Length', fs.statSync(videoPath).size);
      const videoStream = fs.createReadStream(videoPath);
      videoStream.pipe(res);
    }
  } else {
    res.status(404).send('Video no encontrado');
  }
});

app.get('/courses', (req, res) => {
  db.all('SELECT folderName AS courseName, title, imagePath, udemyId FROM courses', [], (err, rows) => {
    if (err) {
      console.error('Error al obtener cursos de la base de datos:', err.message);
      return res.status(500).json({ error: err.message });
    }

    const coursesFromDB = rows.map(row => ({
      courseName: row.courseName,
      title: row.title || row.courseName,
      imagePath: row.imagePath || null,
      udemyId: row.udemyId || null,
      sections: []
    }));

    const folders = fs.readdirSync(videosDir).filter(folder => fs.statSync(path.join(videosDir, folder)).isDirectory());
    const updatedCourses = [];

    for (const folder of folders) {
      const existingCourse = coursesFromDB.find(c => c.courseName === folder);
      if (!existingCourse) {
        const sections = fs.readdirSync(path.join(videosDir, folder)).filter(subfolder => fs.statSync(path.join(videosDir, folder, subfolder)).isDirectory());
        const sectionsInfo = sections.map(section => {
          const videos = fs.readdirSync(path.join(videosDir, folder, section)).filter(file => file.endsWith('.mp4'));
          return {
            sectionName: section,
            videos: videos.map(video => ({
              videoName: video,
              order: video.split(' ')[0],
              url: `http://${process.env.HOST_IP || 'localhost'}:${port}/video/${encodeURIComponent(folder)}/${encodeURIComponent(section)}/${encodeURIComponent(video.replace('.mp4', ''))}`
            }))
          };
        });

        db.run('INSERT INTO courses (folderName, title, imagePath, udemyId) VALUES (?, ?, ?, ?)', 
          [folder, folder, null, null], 
          (err) => {
            if (err) console.error(`Error al insertar curso ${folder}:`, err.message);
          });
        
        updatedCourses.push({
          courseName: folder,
          title: folder,
          imagePath: null,
          udemyId: null,
          sections: sectionsInfo
        });
      } else {
        const sections = fs.readdirSync(path.join(videosDir, folder)).filter(subfolder => fs.statSync(path.join(videosDir, folder, subfolder)).isDirectory());
        const sectionsInfo = sections.map(section => {
          const videos = fs.readdirSync(path.join(videosDir, folder, section)).filter(file => file.endsWith('.mp4'));
          return {
            sectionName: section,
            videos: videos.map(video => ({
              videoName: video,
              order: video.split(' ')[0],
              url: `http://${process.env.HOST_IP || 'localhost'}:${port}/video/${encodeURIComponent(folder)}/${encodeURIComponent(section)}/${encodeURIComponent(video.replace('.mp4', ''))}`
            }))
          };
        });

        updatedCourses.push({
          ...existingCourse,
          sections: sectionsInfo
        });
      }
    }

    res.json(updatedCourses);
  });
});

app.get('/profiles', (req, res) => {
  db.all('SELECT profileName FROM profiles', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map(row => row.profileName));
  });
});

app.post('/profiles', (req, res) => {
  const { profileName } = req.body;
  if (!profileName) {
    return res.status(400).json({ error: 'Se requiere un nombre de perfil' });
  }

  db.run('INSERT OR IGNORE INTO profiles (profileName) VALUES (?)', [profileName], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: `Perfil ${profileName} creado/seleccionado`, profile: profileName });
  });
});

app.get('/profiles/:profileName/progress/:courseName', (req, res) => {
  const { profileName, courseName } = req.params;
  console.log(`Consultando progreso inicial para profileName: ${profileName}, courseName: ${courseName}`);
  db.all('SELECT section, video, position FROM progress WHERE profileName = ? AND courseName = ? ORDER BY id DESC LIMIT 1', [profileName, courseName], (err, rows) => {
    if (err) {
      console.error('Error en la consulta SQL:', err.message);
      return res.status(500).json({ error: err.message });
    }
    console.log('Resultados de la consulta:', rows);
    const row = rows[0] || { section: '', video: '', position: 0 };
    res.json(row);
  });
});

app.post('/profiles/:profileName/progress/:courseName', (req, res) => {
  const { profileName, courseName } = req.params;
  const { section, video, position } = req.body;
  console.log(`Intentando guardar progreso para profileName: ${profileName}, courseName: ${courseName}, section: ${section}, video: ${video}, position: ${position}`);

  if (!section || !video || typeof position !== 'number') {
    return res.status(400).json({ error: 'Se requieren section, video y position' });
  }

  db.run(
    'INSERT OR REPLACE INTO progress (profileName, courseName, section, video, position) VALUES (?, ?, ?, ?, ?)',
    [profileName, courseName, section, video, position],
    (err) => {
      if (err) {
        console.error('Error al guardar el progreso:', err.message);
        return res.status(500).json({ error: err.message });
      }
      db.get('SELECT * FROM progress WHERE profileName = ? AND courseName = ?', [profileName, courseName], (err, row) => {
        if (err) {
          console.error('Error al verificar el registro guardado:', err.message);
        } else {
          console.log('Registro guardado en progress:', row);
        }
      });
      res.json({ message: 'Progreso guardado', progress: { section, video, position } });
    }
  );
});

app.get('/courses/:courseName', (req, res) => {
  const { courseName } = req.params;

  db.get(
    'SELECT folderName, title, imagePath, udemyId FROM courses WHERE folderName = ?',
    [courseName],
    (err, row) => {
      if (err) {
        console.error('Error al obtener curso:', err.message);
        return res.status(500).json({ error: err.message });
      }
      if (!row) {
        return res.status(404).json({ error: 'Curso no encontrado' });
      }

      const courseData = {
        courseName: row.folderName,
        title: row.title || row.folderName,
        imagePath: row.imagePath || null,
        udemyId: row.udemyId || null,
        sections: [],
      };

      const courseDir = path.join(videosDir, courseName);
      if (!fs.existsSync(courseDir) || !fs.statSync(courseDir).isDirectory()) {
        return res.json(courseData);
      }

      const sections = fs
        .readdirSync(courseDir)
        .filter((subfolder) => fs.statSync(path.join(courseDir, subfolder)).isDirectory());
      const sectionsInfo = sections.map((section) => {
        const videos = fs
          .readdirSync(path.join(courseDir, section))
          .filter((file) => file.endsWith('.mp4'));
        return {
          sectionName: section,
          videos: videos.map((video) => ({
            videoName: video,
            order: video.split(' ')[0],
            url: `http://${process.env.HOST_IP || 'localhost'}:${port}/video/${encodeURIComponent(
              courseName
            )}/${encodeURIComponent(section)}/${encodeURIComponent(video.replace('.mp4', ''))}`,
          })),
        };
      });

      courseData.sections = sectionsInfo;
      res.json(courseData);
    }
  );
});

app.post('/courses/sync', (req, res) => {
  const folders = fs.readdirSync(videosDir).filter(folder => fs.statSync(path.join(videosDir, folder)).isDirectory());

  db.all('SELECT folderName, imagePath FROM courses', [], (err, dbCourses) => {
    if (err) {
      console.error('Error al obtener cursos de la base de datos:', err.message);
      return res.status(500).json({ error: err.message });
    }

    const dbCourseNames = dbCourses.map(c => c.folderName);

    // Añadir nuevos cursos
    for (const folder of folders) {
      if (!dbCourseNames.includes(folder)) {
        db.run('INSERT INTO courses (folderName, title, imagePath, udemyId) VALUES (?, ?, ?, ?)', 
          [folder, folder, null, null], 
          (err) => {
            if (err) console.error(`Error al insertar curso ${folder}:`, err.message);
          });
      }
    }

    // Eliminar cursos que ya no existen en videosDir
    dbCourses.forEach(dbCourse => {
      if (!folders.includes(dbCourse.folderName)) {
        db.run('DELETE FROM courses WHERE folderName = ?', [dbCourse.folderName], (err) => {
          if (err) console.error(`Error al eliminar curso ${dbCourse.folderName}:`, err.message);
          else {
            if (dbCourse.imagePath) {
              const imagePath = path.join(publicDir, path.basename(dbCourse.imagePath));
              if (fs.existsSync(imagePath)) {
                fs.unlinkSync(imagePath);
                console.log(`Imagen eliminada: ${imagePath}`);
              }
            }
            db.run('DELETE FROM progress WHERE courseName = ?', [dbCourse.folderName], (err) => {
              if (err) console.error(`Error al eliminar progreso de ${dbCourse.folderName}:`, err.message);
            });
          }
        });
      }
    });

    res.json({ message: 'Cursos sincronizados', courses: folders });
  });
});

process.on('SIGTERM', () => db.close());
process.on('SIGINT', () => db.close());

app.listen(port, host, () => {
  console.log(`Servidor escuchando en http://${host}:${port}`);
});