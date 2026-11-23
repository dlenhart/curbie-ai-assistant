import Foundation
import ImageIO
import Vision
import UniformTypeIdentifiers

struct RecognizedLine: Codable {
    let text: String
    let confidence: Float
}

struct RecognitionOutput: Codable {
    let lines: [RecognizedLine]
}

struct HelperFailure: Error {
    let message: String
}

func fail(_ message: String, code: Int32) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(code)
}

func loadOrientedImage(at url: URL) throws -> CGImage {
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil) else {
        throw HelperFailure(message: "Cannot open image at \(url.path)")
    }
    let options: [CFString: Any] = [
        kCGImageSourceCreateThumbnailFromImageAlways: true,
        kCGImageSourceCreateThumbnailWithTransform: true,
        kCGImageSourceThumbnailMaxPixelSize: 3000,
    ]
    guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary) else {
        throw HelperFailure(message: "Cannot decode image at \(url.path)")
    }
    return image
}

func writeJpeg(_ image: CGImage, to url: URL) throws {
    guard let destination = CGImageDestinationCreateWithURL(url as CFURL, UTType.jpeg.identifier as CFString, 1, nil) else {
        throw HelperFailure(message: "Cannot create JPEG at \(url.path)")
    }
    let properties: [CFString: Any] = [kCGImageDestinationLossyCompressionQuality: 0.85]
    CGImageDestinationAddImage(destination, image, properties as CFDictionary)
    guard CGImageDestinationFinalize(destination) else {
        throw HelperFailure(message: "Cannot write JPEG at \(url.path)")
    }
}

func recognizeLines(in image: CGImage) throws -> [RecognizedLine] {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    request.recognitionLanguages = ["en-US"]
    try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
    let observations = request.results ?? []
    let sorted = observations.sorted { first, second in
        if first.boundingBox.midY != second.boundingBox.midY {
            return first.boundingBox.midY > second.boundingBox.midY
        }
        return first.boundingBox.minX < second.boundingBox.minX
    }
    return sorted.compactMap { observation in
        guard let candidate = observation.topCandidates(1).first else { return nil }
        return RecognizedLine(text: candidate.string, confidence: candidate.confidence)
    }
}

let arguments = CommandLine.arguments
guard arguments.count == 3 else {
    fail("usage: curbie-ocr <input> <displayCopyOutput>", code: 2)
}

do {
    let image = try loadOrientedImage(at: URL(fileURLWithPath: arguments[1]))
    try writeJpeg(image, to: URL(fileURLWithPath: arguments[2]))
    let lines = try recognizeLines(in: image)
    let data = try JSONEncoder().encode(RecognitionOutput(lines: lines))
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data("\n".utf8))
    exit(0)
} catch let failure as HelperFailure {
    fail(failure.message, code: 1)
} catch {
    fail("\(error)", code: 1)
}
