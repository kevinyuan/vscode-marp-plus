const sharp = require('sharp');

// 使用 300 DPI 的密度读取 SVG，确保滤镜（发光和阴影）在高分辨率下依然锐利
sharp('icon.svg', { density: 300 })
    .resize(1024, 1024) // 1024x1024，适配商店与高分屏
    .png()
    .toFile('icon.png')
    .then(() => {
        console.log('High-resolution icon created: icon.png (1024x1024)');
    })
    .catch(err => {
        console.error('Error creating icon:', err);
        process.exit(1);
    });
